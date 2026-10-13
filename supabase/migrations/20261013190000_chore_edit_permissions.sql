-- Existing chore schedules are household records, so changing one is a
-- treasurer decision. Ordinary members still need one narrowly-scoped write:
-- completing the chore currently assigned to them.

create or replace function public.is_valid_chore_completion(
  old_chore  jsonb,
  new_chore  jsonb,
  p_member_id uuid
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  old_history       jsonb;
  new_history       jsonb;
  completion        jsonb;
  every_days        integer;
  rotation_length   integer;
  current_index     integer;
  expected_index    integer;
  expected_assignee text;
begin
  -- A completion cannot rewrite the schedule itself. These four fields are
  -- the only ones completeChore advances or appends to.
  if (old_chore - array['nextDue', 'assigneeId', 'rotationIndex', 'history'])
     is distinct from
     (new_chore - array['nextDue', 'assigneeId', 'rotationIndex', 'history']) then
    return false;
  end if;

  if old_chore ->> 'assigneeId' is distinct from p_member_id::text then
    return false;
  end if;

  old_history := coalesce(old_chore -> 'history', '[]'::jsonb);
  new_history := coalesce(new_chore -> 'history', '[]'::jsonb);
  if jsonb_typeof(old_history) <> 'array'
     or jsonb_typeof(new_history) <> 'array'
     or jsonb_array_length(new_history) <> jsonb_array_length(old_history) + 1
     or (new_history - (jsonb_array_length(new_history) - 1)) <> old_history then
    return false;
  end if;

  completion := new_history -> (jsonb_array_length(new_history) - 1);
  if jsonb_typeof(completion -> 'completedAt') <> 'string'
     or completion <> jsonb_build_object(
       'date', old_chore ->> 'nextDue',
       'assigneeId', old_chore ->> 'assigneeId',
       'completedAt', completion ->> 'completedAt'
     ) then
    return false;
  end if;

  every_days := (old_chore ->> 'everyDays')::integer;

  if every_days <= 0 then
    -- A one-off closes exactly once and does not move to another date/person.
    if exists (
      select 1
      from jsonb_array_elements(old_history) prior
      where prior ->> 'date' = old_chore ->> 'nextDue'
    ) then
      return false;
    end if;

    return new_chore ->> 'nextDue' = old_chore ->> 'nextDue'
       and new_chore ->> 'assigneeId' = old_chore ->> 'assigneeId'
       and new_chore ->> 'rotationIndex' = old_chore ->> 'rotationIndex';
  end if;

  if new_chore ->> 'nextDue'
     <> ((old_chore ->> 'nextDue')::date + every_days)::text then
    return false;
  end if;

  if old_chore ->> 'assignMode' <> 'rotation'
     or jsonb_array_length(coalesce(old_chore -> 'rotationIds', '[]'::jsonb)) = 0 then
    return new_chore ->> 'assigneeId' = old_chore ->> 'assigneeId'
       and new_chore ->> 'rotationIndex' = old_chore ->> 'rotationIndex';
  end if;

  rotation_length := jsonb_array_length(old_chore -> 'rotationIds');
  select (position - 1)::integer into current_index
  from jsonb_array_elements_text(old_chore -> 'rotationIds')
       with ordinality as rotation(member_id, position)
  where member_id = old_chore ->> 'assigneeId'
  limit 1;

  if current_index is null then
    current_index := (
      ((old_chore ->> 'rotationIndex')::integer % rotation_length)
      + rotation_length
    ) % rotation_length;
  end if;

  expected_index := (current_index + 1) % rotation_length;
  expected_assignee := old_chore -> 'rotationIds' ->> expected_index;

  return new_chore ->> 'assigneeId' = expected_assignee
     and (new_chore ->> 'rotationIndex')::integer = expected_index;
exception
  -- Malformed client JSON is never a valid completion transition.
  when others then
    return false;
end;
$$;

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

  -- Lock the row so the permission and version checks apply to the same copy.
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

  if not public.is_group_treasurer(p_group_id) then
    if exists (
      select 1
      from jsonb_array_elements(coalesce(current_chores, '[]'::jsonb)) existing
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(p_chores, '[]'::jsonb)) proposed
        where proposed ->> 'id' = existing ->> 'id'
      )
    ) then
      raise exception 'Only the treasurer can delete chores';
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
         ) then
        raise exception 'Only the treasurer can edit chores';
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
