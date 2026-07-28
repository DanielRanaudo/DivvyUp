-- ============================================================================
-- Concurrency: version the JSON documents, track modification times
-- ============================================================================
-- Chores and subgroups live as whole JSON documents on the groups row, and
-- update_group_docs rewrote both of them in full. Two roommates editing
-- different chores at the same time meant the second write silently threw away
-- the first one's work.
--
-- The fix is a version counter: a writer says which version it read, and the
-- update is refused if the document has moved on since. The client refetches
-- and tells the user, instead of losing the edit without a word.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Version counter for the chores/subgroups documents
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists docs_version integer not null default 0;

-- The signature changes, so the old three-argument version has to go rather
-- than sitting alongside as an overload.
drop function if exists public.update_group_docs(uuid, jsonb, jsonb);

create or replace function public.update_group_docs(
  p_group_id  uuid,
  p_subgroups jsonb,
  p_chores    jsonb,
  p_version   integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version integer;
  next_version    integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;

  -- Lock the row so two writers can't both read the same version and pass.
  select docs_version into current_version
  from public.groups
  where id = p_group_id
  for update;

  if current_version is null then
    raise exception 'That group no longer exists';
  end if;

  if p_version is not null and p_version <> current_version then
    -- serialization_failure: the client recognises this code and reloads.
    raise exception 'Someone else changed the chores or floors while you were editing'
      using errcode = '40001';
  end if;

  update public.groups
  set subgroups    = p_subgroups,
      chores       = p_chores,
      docs_version = current_version + 1
  where id = p_group_id
  returning docs_version into next_version;

  return next_version;
end;
$$;

grant execute on function public.update_group_docs(uuid, jsonb, jsonb, integer)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 2. updated_at everywhere
-- ---------------------------------------------------------------------------
-- Nothing recorded when a row last changed, which makes both conflict
-- detection and after-the-fact debugging guesswork.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'groups', 'group_members', 'rent', 'utilities', 'expenses', 'payments'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists updated_at
         timestamptz not null default now()', t
    );
    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format(
      'create trigger touch_%I before update on public.%I
         for each row execute function public.touch_updated_at()', t, t
    );
  end loop;
end;
$$;
