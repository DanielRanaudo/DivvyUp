-- ============================================================================
-- DivvyUp - Supabase schema, security (RLS) and RPCs
-- ============================================================================
-- HOW TO USE:
--   1. Open your Supabase project -> SQL Editor -> New query
--   2. Paste this entire file and click "Run"
--   3. It is safe to re-run (idempotent): tables use IF NOT EXISTS, functions
--      use CREATE OR REPLACE, and policies/triggers are dropped first.
--
-- SECURITY MODEL:
--   - Every table has Row Level Security enabled.
--   - A user can only read/write data for groups they are a member of.
--   - "member id" everywhere = group_members.id (matches the app's Member.id).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text not null default '',
  venmo      text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  code         text not null unique,
  smart_settle boolean not null default false,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table if not exists public.group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  venmo        text not null default '',
  is_treasurer boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.rent (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null unique references public.groups(id) on delete cascade,
  amount      numeric not null,
  split_type  text not null check (split_type in ('equal','percentage','custom')),
  recurring   boolean not null default true,
  percentages jsonb not null default '{}',
  customs     jsonb not null default '{}',
  splits      jsonb not null default '{}'
);

create table if not exists public.utilities (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.groups(id) on delete cascade,
  name      text not null,
  amount    numeric not null,
  recurring boolean not null default true,
  splits    jsonb not null default '{}',
  date      timestamptz not null default now()
);

create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id) on delete cascade,
  submitted_by      uuid references public.group_members(id) on delete cascade,
  submitted_by_name text not null,
  description       text not null,
  amount            numeric not null,
  status            text not null default 'pending'
                      check (status in ('pending','approved','denied')),
  splits            jsonb,
  images            jsonb not null default '[]',
  date              timestamptz not null default now()
);

create table if not exists public.payments (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.groups(id) on delete cascade,
  from_id   uuid references public.group_members(id) on delete cascade,
  from_name text not null,
  to_id     uuid references public.group_members(id) on delete cascade,
  to_name   text not null,
  amount    numeric not null,
  status    text not null default 'pending'
              check (status in ('pending','confirmed','rejected')),
  date      timestamptz not null default now()
);

-- Helpful indexes for group-scoped lookups
create index if not exists idx_group_members_group on public.group_members(group_id);
create index if not exists idx_group_members_user  on public.group_members(user_id);
create index if not exists idx_utilities_group      on public.utilities(group_id);
create index if not exists idx_expenses_group       on public.expenses(group_id);
create index if not exists idx_payments_group       on public.payments(group_id);

-- v2 feature columns (safe to run on an already-created database).
-- Subgroups ("Floors") and chores are stored as JSON documents on the group.
alter table public.groups
  add column if not exists subgroups jsonb not null default '[]',
  add column if not exists chores    jsonb not null default '[]';
alter table public.expenses
  add column if not exists images jsonb not null default '[]';


-- ---------------------------------------------------------------------------
-- 2. Table privileges (RLS is the real gate; these just allow the role in)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.groups, public.group_members,
  public.rent, public.utilities, public.expenses, public.payments
  to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Auto-create a profile row when a user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, venmo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'venmo', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 4. Security-definer helpers (bypass RLS internally -> no policy recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_treasurer(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and is_treasurer
  );
$$;

create or replace function public.my_member_id(gid uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.group_members
  where group_id = gid and user_id = auth.uid()
  limit 1;
$$;


-- ---------------------------------------------------------------------------
-- 5. Enable Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.rent           enable row level security;
alter table public.utilities      enable row level security;
alter table public.expenses       enable row level security;
alter table public.payments       enable row level security;


-- ---------------------------------------------------------------------------
-- 6. Policies
-- ---------------------------------------------------------------------------

-- profiles: only your own row
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- groups: readable by members, updatable/deletable by treasurer/creator.
-- (INSERT is done through the create_group RPC below.)
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (public.is_group_member(id));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (public.is_group_treasurer(id))
  with check (public.is_group_treasurer(id));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (created_by = auth.uid());

-- group_members: readable by members; self or treasurer can edit; treasurer
-- or the member themselves can delete. (INSERT is via create_group/join_group.)
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members
  for select using (public.is_group_member(group_id));

drop policy if exists members_update on public.group_members;
create policy members_update on public.group_members
  for update using (
    user_id = auth.uid() or public.is_group_treasurer(group_id)
  )
  with check (
    user_id = auth.uid() or public.is_group_treasurer(group_id)
  );

drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members
  for delete using (
    user_id = auth.uid() or public.is_group_treasurer(group_id)
  );

-- rent: members read, treasurer writes
drop policy if exists rent_select on public.rent;
create policy rent_select on public.rent
  for select using (public.is_group_member(group_id));

drop policy if exists rent_write on public.rent;
create policy rent_write on public.rent
  for all using (public.is_group_treasurer(group_id))
  with check (public.is_group_treasurer(group_id));

-- utilities: members read, treasurer writes
drop policy if exists utilities_select on public.utilities;
create policy utilities_select on public.utilities
  for select using (public.is_group_member(group_id));

drop policy if exists utilities_write on public.utilities;
create policy utilities_write on public.utilities
  for all using (public.is_group_treasurer(group_id))
  with check (public.is_group_treasurer(group_id));

-- expenses: members read, a member submits as themselves, treasurer approves/denies
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (public.is_group_member(group_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (submitted_by = public.my_member_id(group_id));

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (public.is_group_treasurer(group_id))
  with check (public.is_group_treasurer(group_id));

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (public.is_group_treasurer(group_id));

-- payments: members read, a member records their own payment, the recipient
-- (or treasurer) confirms/rejects it
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (public.is_group_member(group_id));

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (from_id = public.my_member_id(group_id));

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update using (
    to_id = public.my_member_id(group_id) or public.is_group_treasurer(group_id)
  )
  with check (
    to_id = public.my_member_id(group_id) or public.is_group_treasurer(group_id)
  );

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete using (public.is_group_treasurer(group_id));


-- ---------------------------------------------------------------------------
-- 7. RPCs for creating and joining groups
--    (SECURITY DEFINER so joining by code can look up a group you can't see yet)
-- ---------------------------------------------------------------------------

-- The creator's display name and Venmo/Zelle come from their profile
-- (captured at signup), so they are not passed in from the client.
drop function if exists public.create_group(text, text, text);

create or replace function public.create_group(
  p_group_name  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id       uuid;
  new_code   text;
  p_name     text;
  p_venmo    text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select name, venmo into p_name, p_venmo
  from public.profiles
  where id = auth.uid();

  loop
    new_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.groups where code = new_code);
  end loop;

  insert into public.groups (name, code, created_by)
  values (p_group_name, new_code, auth.uid())
  returning id into g_id;

  insert into public.group_members (group_id, user_id, name, venmo, is_treasurer)
  values (g_id, auth.uid(), coalesce(p_name, ''), coalesce(p_venmo, ''), true);

  return g_id;
end;
$$;

create or replace function public.join_group(
  p_code        text,
  p_display_name text,
  p_venmo       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into g_id from public.groups where code = upper(trim(p_code));
  if g_id is null then
    raise exception 'Group not found';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = g_id and user_id = auth.uid()
  ) then
    raise exception 'You are already in this group';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = g_id and lower(name) = lower(trim(p_display_name))
  ) then
    raise exception 'Name already taken';
  end if;

  insert into public.group_members (group_id, user_id, name, venmo, is_treasurer)
  values (g_id, auth.uid(), trim(p_display_name), coalesce(p_venmo, ''), false);

  return g_id;
end;
$$;

grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text, text, text)  to authenticated;

-- Chores and subgroups live as JSON documents on the groups row, but any
-- member (not just the treasurer) may edit them. The groups UPDATE policy is
-- treasurer-only, so member edits go through this RPC, which only touches the
-- two document columns and verifies membership itself.
create or replace function public.update_group_docs(
  p_group_id  uuid,
  p_subgroups jsonb,
  p_chores    jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;

  update public.groups
  set subgroups = p_subgroups,
      chores    = p_chores
  where id = p_group_id;
end;
$$;

grant execute on function public.update_group_docs(uuid, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- 8. Storage: receipt images
--    Objects are stored as {group_id}/{uuid}.jpg. The bucket is public for
--    reads (URLs are unguessable UUIDs); uploads/deletes require membership
--    in the group whose folder is being written to.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );


-- ---------------------------------------------------------------------------
-- 9. Realtime (so roommates see live updates). Safe to ignore errors here if
--    a table is already in the publication.
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table
    public.groups, public.group_members, public.rent,
    public.utilities, public.expenses, public.payments;
exception
  when duplicate_object then null;
  when others then null;
end;
$$;
