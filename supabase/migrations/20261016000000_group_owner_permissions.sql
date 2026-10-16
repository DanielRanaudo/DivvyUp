-- Separate household ownership from the transferable treasurer role.
--
-- The person who created a group remains its owner while they are a member.
-- Owners manage the household (chores, members, and group settings), while the
-- treasurer remains the only person who can make financial decisions.

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    join public.group_members m
      on m.group_id = g.id and m.user_id = auth.uid()
    where g.id = gid and g.created_by = auth.uid()
  );
$$;

create or replace function public.is_group_creator(
  gid uuid,
  candidate_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.groups
    where id = gid and created_by = candidate_user_id
  );
$$;

create or replace function public.can_manage_group(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_group_owner(gid) or public.is_group_treasurer(gid);
$$;

revoke all on function public.is_group_owner(uuid) from public, anon;
revoke all on function public.is_group_creator(uuid, uuid) from public, anon;
revoke all on function public.can_manage_group(uuid) from public, anon;
grant execute on function public.is_group_owner(uuid) to authenticated, service_role;
grant execute on function public.is_group_creator(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_group(uuid) to authenticated, service_role;

-- Owners and treasurers can edit household settings. Financial tables retain
-- their existing treasurer-only policies.
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (public.can_manage_group(id))
  with check (public.can_manage_group(id));

drop policy if exists members_update on public.group_members;
create policy members_update on public.group_members
  for update using (
    user_id = auth.uid() or public.can_manage_group(group_id)
  )
  with check (
    user_id = auth.uid() or public.can_manage_group(group_id)
  );

-- A member may always leave voluntarily. Managers may remove other ordinary
-- members, but a treasurer cannot remove the owner and nobody can remove the
-- current treasurer through a raw row delete.
drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members
  for delete using (
    user_id = auth.uid()
    or (
      public.can_manage_group(group_id)
      and not public.is_group_creator(group_id, user_id)
      and not is_treasurer
    )
  );

-- RLS controls who may update profile fields; the role itself can only move
-- through transfer_treasurer. The partial unique index also protects the
-- one-treasurer invariant if a future write path is added incorrectly.
create unique index if not exists group_members_one_treasurer_idx
  on public.group_members (group_id)
  where is_treasurer;

create or replace function public.guard_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_treasurer is distinct from old.is_treasurer
     and current_setting('divvyup.treasurer_transfer_group', true)
       is distinct from old.group_id::text then
    raise exception 'Treasurer changes must use transfer_treasurer';
  end if;

  if new.group_id is distinct from old.group_id
     or new.user_id is distinct from old.user_id then
    raise exception 'A membership cannot be moved to another group or user';
  end if;

  return new;
end;
$$;

create or replace function public.guard_group_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'Group ownership cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_group_owner() from public;
drop trigger if exists guard_group_owner_trg on public.groups;
create trigger guard_group_owner_trg
  before update of created_by on public.groups
  for each row execute function public.guard_group_owner();

-- Either manager may choose the treasurer. Locking the group serializes two
-- simultaneous handovers. The transaction-local marker lets only this RPC
-- pass the column guard while it demotes, then promotes, under the unique
-- index. Any error rolls the whole handover back.
create or replace function public.transfer_treasurer(
  p_group_id  uuid,
  p_member_id uuid
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

  perform 1 from public.groups where id = p_group_id for update;

  if not public.can_manage_group(p_group_id) then
    raise exception 'Only the group owner or current treasurer can hand over the role';
  end if;

  if not exists (
    select 1 from public.group_members
    where id = p_member_id and group_id = p_group_id
  ) then
    raise exception 'That person is not in this group';
  end if;

  if exists (
    select 1 from public.group_members
    where id = p_member_id and group_id = p_group_id and is_treasurer
  ) then
    return;
  end if;

  perform set_config(
    'divvyup.treasurer_transfer_group',
    p_group_id::text,
    true
  );

  update public.group_members
  set is_treasurer = false
  where group_id = p_group_id and is_treasurer;

  update public.group_members
  set is_treasurer = true
  where id = p_member_id and group_id = p_group_id;

  perform set_config('divvyup.treasurer_transfer_group', '', true);
end;
$$;

grant execute on function public.transfer_treasurer(uuid, uuid) to authenticated;

-- Keep ordinary members' narrow chore writes: they may add a chore, complete
-- their assigned occurrence, or report it later. Owners and treasurers may
-- additionally edit/delete schedules and excuse history entries.
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
  current_chores  jsonb;
  next_version    integer;
  my_member_id    uuid;
  old_chore       jsonb;
  new_chore       jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;

  select docs_version, chores into current_version, current_chores
  from public.groups
  where id = p_group_id
  for update;

  if current_version is null then
    raise exception 'That group no longer exists';
  end if;

  if p_version is not null and p_version <> current_version then
    raise exception 'Someone else changed the chores or floors while you were editing'
      using errcode = '40001';
  end if;

  if jsonb_typeof(coalesce(p_chores, '[]'::jsonb)) <> 'array'
     or exists (
       select 1
       from jsonb_array_elements(coalesce(p_chores, '[]'::jsonb)) chore
       group by chore ->> 'id'
       having chore ->> 'id' is null or count(*) > 1
     ) then
    raise exception 'Chores must have unique ids';
  end if;

  if not public.can_manage_group(p_group_id) then
    if exists (
      select 1
      from jsonb_array_elements(coalesce(current_chores, '[]'::jsonb)) existing
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(p_chores, '[]'::jsonb)) proposed
        where proposed ->> 'id' = existing ->> 'id'
      )
    ) then
      raise exception 'Only the group owner or treasurer can delete chores';
    end if;

    my_member_id := public.my_member_id(p_group_id);
    for old_chore in
      select value
      from jsonb_array_elements(coalesce(current_chores, '[]'::jsonb))
    loop
      select value into new_chore
      from jsonb_array_elements(coalesce(p_chores, '[]'::jsonb))
      where value ->> 'id' = old_chore ->> 'id';

      if new_chore is distinct from old_chore
         and not public.is_valid_chore_completion(
           old_chore, new_chore, my_member_id
         )
         and not public.is_valid_chore_late_report(
           old_chore, new_chore, my_member_id
         ) then
        raise exception 'Only the group owner or treasurer can edit chores';
      end if;
    end loop;
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
