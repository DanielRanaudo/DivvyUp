-- ============================================================================
-- Security hardening
-- ============================================================================
-- The browser talks to Postgres directly with the anon key, so a rule that is
-- only enforced in a React component is not enforced at all. This migration
-- closes the gaps where the UI was the only thing standing between a group
-- member and someone else's money.
--
-- Holes closed here:
--   1. Any member could UPDATE their own group_members row and set
--      is_treasurer = true, gaining full control of the group.
--   2. expenses_insert checked *who* submitted but not the status, so a member
--      could insert an already-'approved' expense with splits of their choosing.
--   3. payments_insert had the same gap, letting a debtor insert a 'confirmed'
--      payment and erase their debt without paying.
--   4. payments_update checked *who* was updating but not *which columns*, so
--      the recipient could rewrite `amount` while confirming.
--   5. The receipts bucket was public, making every receipt readable by anyone
--      holding the URL, signed out.
--   6. Invite codes were 6 hex characters (~16.7M) with no throttling.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Money columns must hold sane values
-- ---------------------------------------------------------------------------
-- Rent and bills may legitimately be zero (a placeholder before the real
-- number is known); an expense or a payment of zero is meaningless.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rent_amount_nonneg'
  ) then
    alter table public.rent
      add constraint rent_amount_nonneg check (amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'utilities_amount_nonneg'
  ) then
    alter table public.utilities
      add constraint utilities_amount_nonneg check (amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expenses_amount_positive'
  ) then
    alter table public.expenses
      add constraint expenses_amount_positive check (amount > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payments_amount_positive'
  ) then
    alter table public.payments
      add constraint payments_amount_positive check (amount > 0);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. group_members: stop self-promotion to treasurer
-- ---------------------------------------------------------------------------
-- An RLS policy cannot compare the old row to the new one, so members_update
-- (which must keep letting people edit their own name/venmo/zelle) cannot
-- express "except is_treasurer". A BEFORE UPDATE trigger can.

create or replace function public.guard_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_treasurer is distinct from old.is_treasurer
     and not public.is_group_treasurer(old.group_id) then
    raise exception 'Only a treasurer can change who the treasurer is';
  end if;

  if new.group_id is distinct from old.group_id
     or new.user_id is distinct from old.user_id then
    raise exception 'A membership cannot be moved to another group or user';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_member_columns_trg on public.group_members;
create trigger guard_member_columns_trg
  before update on public.group_members
  for each row execute function public.guard_member_columns();


-- Handing the role over is a legitimate action, so give it a front door that
-- verifies the caller is the current treasurer. The new treasurer is promoted
-- before the old one steps down, because the trigger above checks the caller's
-- treasurer status on every row it touches.
create or replace function public.transfer_treasurer(
  p_group_id  uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_treasurer(p_group_id) then
    raise exception 'Only the current treasurer can hand over the role';
  end if;

  if not exists (
    select 1 from public.group_members
    where id = p_member_id and group_id = p_group_id
  ) then
    raise exception 'That person is not in this group';
  end if;

  my_id := public.my_member_id(p_group_id);
  if my_id = p_member_id then
    return;
  end if;

  update public.group_members
  set is_treasurer = true
  where id = p_member_id;

  update public.group_members
  set is_treasurer = false
  where id = my_id;
end;
$$;

grant execute on function public.transfer_treasurer(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. expenses: submissions always start as pending, with no splits
-- ---------------------------------------------------------------------------
-- Splits are money. They are decided at approval time by the treasurer (see
-- approve_expense below), never by the submitter.

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (
    submitted_by = public.my_member_id(group_id)
    and status = 'pending'
    and splits is null
  );

-- Direct UPDATEs are gone: every state change goes through an RPC that checks
-- authorisation and validates the numbers.
drop policy if exists expenses_update on public.expenses;

-- The treasurer can remove anything; a submitter can withdraw their own
-- request as long as it hasn't been approved yet.
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (
    public.is_group_treasurer(group_id)
    or (status = 'pending' and submitted_by = public.my_member_id(group_id))
  );


-- ---------------------------------------------------------------------------
-- 4. payments: records always start as pending, recipient must be a member
-- ---------------------------------------------------------------------------

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (
    from_id = public.my_member_id(group_id)
    and status = 'pending'
  );

-- Nothing enforced that to_id belonged to the same group, so a payer could
-- point a payment at a member id from a group they aren't even in.
create or replace function public.guard_payment_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.to_id is null or not exists (
    select 1 from public.group_members
    where id = new.to_id and group_id = new.group_id
  ) then
    raise exception 'The person being paid is not in this group';
  end if;

  if new.from_id is null or not exists (
    select 1 from public.group_members
    where id = new.from_id and group_id = new.group_id
  ) then
    raise exception 'The person paying is not in this group';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_payment_participants_trg on public.payments;
create trigger guard_payment_participants_trg
  before insert on public.payments
  for each row execute function public.guard_payment_participants();

-- As with expenses, confirmation moves to an RPC so only `status` can change.
drop policy if exists payments_update on public.payments;


-- ---------------------------------------------------------------------------
-- 5. Status-transition RPCs
-- ---------------------------------------------------------------------------
-- These are the only way an expense or payment can change state. Each one
-- re-reads the row server-side, checks the caller's authorisation against the
-- row's own group, and refuses to act on a row that has already been decided.

create or replace function public.approve_expense(
  p_expense_id uuid,
  p_splits     jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e           record;
  split_total numeric := 0;
  member_key  text;
  share       numeric;
begin
  select id, group_id, amount, status
    into e
  from public.expenses
  where id = p_expense_id;

  if e.id is null then
    raise exception 'That expense no longer exists';
  end if;

  if not public.is_group_treasurer(e.group_id) then
    raise exception 'Only the treasurer can approve expenses';
  end if;

  if e.status <> 'pending' then
    raise exception 'That expense has already been reviewed';
  end if;

  if p_splits is null or jsonb_typeof(p_splits) <> 'object' then
    raise exception 'An approved expense needs a split';
  end if;

  for member_key, share in
    select key, value::numeric from jsonb_each_text(p_splits)
  loop
    if member_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'The split refers to someone who is not in this group';
    end if;

    if share < 0 then
      raise exception 'A split cannot be a negative amount';
    end if;

    if not exists (
      select 1 from public.group_members
      where id = member_key::uuid and group_id = e.group_id
    ) then
      raise exception 'The split refers to someone who is not in this group';
    end if;

    split_total := split_total + share;
  end loop;

  -- A cent of slack absorbs the rounding in an even split.
  if abs(split_total - e.amount) > 0.01 then
    raise exception 'The split has to add up to the expense total';
  end if;

  update public.expenses
  set status = 'approved',
      splits = p_splits
  where id = p_expense_id;
end;
$$;

create or replace function public.deny_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  select id, group_id, status into e
  from public.expenses where id = p_expense_id;

  if e.id is null then
    raise exception 'That expense no longer exists';
  end if;

  if not public.is_group_treasurer(e.group_id) then
    raise exception 'Only the treasurer can deny expenses';
  end if;

  if e.status <> 'pending' then
    raise exception 'That expense has already been reviewed';
  end if;

  update public.expenses set status = 'denied' where id = p_expense_id;
end;
$$;

-- Undo: puts a reviewed expense back in the queue and drops its splits, so the
-- balances it created disappear until it is approved again.
create or replace function public.reopen_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  select id, group_id, status into e
  from public.expenses where id = p_expense_id;

  if e.id is null then
    raise exception 'That expense no longer exists';
  end if;

  if not public.is_group_treasurer(e.group_id) then
    raise exception 'Only the treasurer can reopen an expense';
  end if;

  if e.status = 'pending' then
    return;
  end if;

  update public.expenses
  set status = 'pending',
      splits = null
  where id = p_expense_id;
end;
$$;

-- Editing is restricted to pending expenses: changing the amount of an
-- approved one would leave its splits pointing at a total that no longer
-- exists, so it has to be reopened first.
create or replace function public.update_expense(
  p_expense_id  uuid,
  p_description text,
  p_amount      numeric,
  p_images      jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  select id, group_id, status, submitted_by into e
  from public.expenses where id = p_expense_id;

  if e.id is null then
    raise exception 'That expense no longer exists';
  end if;

  if e.status <> 'pending' then
    raise exception 'Reopen this expense before editing it';
  end if;

  if e.submitted_by is distinct from public.my_member_id(e.group_id)
     and not public.is_group_treasurer(e.group_id) then
    raise exception 'Only the person who submitted this can edit it';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'An expense needs an amount above zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'An expense needs a description';
  end if;

  update public.expenses
  set description = btrim(p_description),
      amount      = p_amount,
      images      = coalesce(p_images, '[]'::jsonb)
  where id = p_expense_id;
end;
$$;

create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_status     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if p_status not in ('confirmed', 'rejected') then
    raise exception 'A payment can only be confirmed or rejected';
  end if;

  select id, group_id, to_id, status into p
  from public.payments where id = p_payment_id;

  if p.id is null then
    raise exception 'That payment no longer exists';
  end if;

  if p.to_id is distinct from public.my_member_id(p.group_id)
     and not public.is_group_treasurer(p.group_id) then
    raise exception 'Only the person who was paid can confirm this';
  end if;

  if p.status <> 'pending' then
    raise exception 'That payment has already been reviewed';
  end if;

  update public.payments set status = p_status where id = p_payment_id;
end;
$$;

grant execute on function public.approve_expense(uuid, jsonb) to authenticated;
grant execute on function public.deny_expense(uuid)            to authenticated;
grant execute on function public.reopen_expense(uuid)          to authenticated;
grant execute on function public.update_expense(uuid, text, numeric, jsonb)
  to authenticated;
grant execute on function public.confirm_payment(uuid, text)   to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Invite codes: longer, and throttled
-- ---------------------------------------------------------------------------
-- 10 Crockford base32 characters (I, L, O and U omitted so codes can be read
-- aloud) gives ~1.1e15 combinations instead of ~1.7e7. Bytes come from
-- gen_random_uuid(), and 256 divides evenly by 32, so there is no modulo bias.

create or replace function public.generate_group_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  raw      bytea;
  candidate text;
  i        int;
begin
  loop
    raw := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    candidate := '';
    for i in 1..10 loop
      candidate := candidate || substr(alphabet, 1 + (get_byte(raw, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups where code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.create_group(p_group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id     uuid;
  p_name   text;
  p_venmo  text;
  p_zelle  text;
  p_avatar text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_group_name is null or btrim(p_group_name) = '' then
    raise exception 'A group needs a name';
  end if;

  select name, venmo, zelle, avatar_url
    into p_name, p_venmo, p_zelle, p_avatar
  from public.profiles
  where id = auth.uid();

  insert into public.groups (name, code, created_by)
  values (btrim(p_group_name), public.generate_group_code(), auth.uid())
  returning id into g_id;

  insert into public.group_members
    (group_id, user_id, name, venmo, zelle, avatar_url, is_treasurer)
  values (
    g_id, auth.uid(), coalesce(p_name, ''), coalesce(p_venmo, ''),
    coalesce(p_zelle, ''), p_avatar, true
  );

  return g_id;
end;
$$;

-- Guessing codes costs an attacker nothing today. Record failed lookups per
-- user and refuse to keep checking once they look like they are fishing.
create table if not exists public.join_attempts (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_join_attempts_user_time
  on public.join_attempts(user_id, attempted_at desc);

-- No grants and no policies: only the SECURITY DEFINER RPC below touches this.
alter table public.join_attempts enable row level security;

-- Returns null when the code doesn't match a group. Raising instead would roll
-- back the attempt row and defeat the throttle, and a null also avoids
-- confirming to the caller whether a code exists.
create or replace function public.join_group(
  p_code         text,
  p_display_name text,
  p_venmo        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id       uuid;
  p_zelle    text;
  p_avatar   text;
  recent     int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'Please enter the name your roommates will see';
  end if;

  select count(*) into recent
  from public.join_attempts
  where user_id = auth.uid()
    and attempted_at > now() - interval '1 hour';

  if recent >= 10 then
    raise exception 'Too many incorrect invite codes. Please try again later.';
  end if;

  select id into g_id from public.groups
  where code = upper(btrim(p_code));

  if g_id is null then
    insert into public.join_attempts (user_id) values (auth.uid());
    return null;
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = g_id and user_id = auth.uid()
  ) then
    raise exception 'You are already in this group';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = g_id and lower(name) = lower(btrim(p_display_name))
  ) then
    raise exception 'Someone in this group already uses that name';
  end if;

  select zelle, avatar_url into p_zelle, p_avatar
  from public.profiles
  where id = auth.uid();

  insert into public.group_members
    (group_id, user_id, name, venmo, zelle, avatar_url, is_treasurer)
  values (
    g_id, auth.uid(), btrim(p_display_name), coalesce(p_venmo, ''),
    coalesce(p_zelle, ''), p_avatar, false
  );

  -- A correct code clears the slate so a typo earlier doesn't linger.
  delete from public.join_attempts where user_id = auth.uid();

  return g_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. Receipts are private
-- ---------------------------------------------------------------------------
-- The bucket was public, so a receipt URL worked for anyone, signed in or not
-- and in any group. Receipts show names, addresses and purchases. The client
-- now stores the object path and asks for a short-lived signed URL when it
-- actually needs to display one; the storage policies already scope access to
-- members of the group that owns the folder.

update storage.buckets set public = false where id = 'receipts';
