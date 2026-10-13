-- Existing chores are household records, so removing one is a treasurer
-- decision. Keeping this check in the RPC matters because hiding the delete
-- button does not stop a member from calling Supabase directly.

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

  if not public.is_group_treasurer(p_group_id) and exists (
    select 1
    from jsonb_array_elements(coalesce(current_chores, '[]'::jsonb)) old_chore
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(p_chores, '[]'::jsonb)) new_chore
      where new_chore ->> 'id' = old_chore ->> 'id'
    )
  ) then
    raise exception 'Only the treasurer can delete chores';
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
