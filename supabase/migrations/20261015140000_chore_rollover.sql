-- Recurring chore schedules advance when the next occurrence begins, even if
-- nobody confirmed the previous one. The previous occurrence is retained as
-- "not_confirmed" history so a forgotten tap cannot freeze the household.

alter table public.groups
  add column if not exists timezone text not null default 'America/New_York';

-- A treasurer can update the groups row directly, so validate the zone below
-- the API layer too. An invalid zone would otherwise make every later rollover
-- fail and prevent the household from loading.
create or replace function public.validate_group_timezone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.timezone is null or not exists (
    select 1 from pg_timezone_names where name = new.timezone
  ) then
    raise exception 'Unknown household timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_group_timezone on public.groups;
create trigger validate_group_timezone
before insert or update of timezone on public.groups
for each row execute function public.validate_group_timezone();

revoke all on function public.validate_group_timezone() from public;

-- Keep the original one-argument create_group for older deployed clients and
-- add a named two-argument overload for clients that know the household zone.
create or replace function public.create_group(
  p_group_name text,
  p_timezone   text
)
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

  -- Give RPC callers the same clear error as the table trigger, before doing
  -- any other work in the transaction.
  if p_timezone is null or not exists (
    select 1 from pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Unknown household timezone' using errcode = '22023';
  end if;

  select name, venmo, zelle, avatar_url
    into p_name, p_venmo, p_zelle, p_avatar
  from public.profiles
  where id = auth.uid();

  insert into public.groups (name, code, created_by, timezone)
  values (
    btrim(p_group_name), public.generate_group_code(), auth.uid(), p_timezone
  )
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

grant execute on function public.create_group(text, text) to authenticated;

-- Pure JSON transition used by both member-triggered reconciliation and the
-- daily service job. One-time chores are deliberately returned unchanged.
create or replace function public.rollover_chore_json(
  p_chore      jsonb,
  p_today      date,
  p_recorded_at timestamptz
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  next_chore      jsonb := p_chore;
  history         jsonb;
  rotation        jsonb;
  every_days      integer;
  next_due        date;
  rotation_length integer;
  current_index   integer;
  next_index      integer;
  turns           integer := 0;
begin
  if jsonb_typeof(p_chore) <> 'object' then
    return p_chore;
  end if;

  every_days := (p_chore ->> 'everyDays')::integer;
  if every_days <= 0 then
    return p_chore;
  end if;

  next_due := (p_chore ->> 'nextDue')::date;
  history := coalesce(p_chore -> 'history', '[]'::jsonb);
  if jsonb_typeof(history) <> 'array' then
    raise exception 'Chore history must be an array';
  end if;

  rotation := coalesce(p_chore -> 'rotationIds', '[]'::jsonb);
  if jsonb_typeof(rotation) <> 'array' then
    raise exception 'Chore rotationIds must be an array';
  end if;
  rotation_length := jsonb_array_length(rotation);

  while next_due + every_days <= p_today loop
    if turns >= 10000 then
      raise exception 'Chore rollover exceeded the safety limit';
    end if;

    history := history || jsonb_build_array(jsonb_build_object(
      'date', next_due::text,
      'assigneeId', next_chore ->> 'assigneeId',
      'outcome', 'not_confirmed',
      'recordedAt', p_recorded_at
    ));
    next_due := next_due + every_days;

    if next_chore ->> 'assignMode' = 'rotation' and rotation_length > 0 then
      select (position - 1)::integer into current_index
      from jsonb_array_elements_text(rotation)
           with ordinality as members(member_id, position)
      where member_id = next_chore ->> 'assigneeId'
      limit 1;

      if current_index is null then
        current_index := (
          ((coalesce((next_chore ->> 'rotationIndex')::integer, 0)
             % rotation_length) + rotation_length) % rotation_length
        );
      end if;

      next_index := (current_index + 1) % rotation_length;
      next_chore := jsonb_set(
        jsonb_set(
          next_chore,
          '{rotationIndex}',
          to_jsonb(next_index),
          true
        ),
        '{assigneeId}',
        to_jsonb(rotation ->> next_index),
        true
      );
    end if;

    turns := turns + 1;
  end loop;

  if turns = 0 then
    return p_chore;
  end if;

  return jsonb_set(
    jsonb_set(next_chore, '{history}', history, true),
    '{nextDue}',
    to_jsonb(next_due::text),
    true
  );
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception 'Malformed chore schedule';
end;
$$;

revoke all on function public.rollover_chore_json(jsonb, date, timestamptz)
  from public, anon, authenticated;

-- Locks and reconciles one document. Keeping this helper non-public lets the
-- member RPC and the service job share exactly the same transition.
create or replace function public.reconcile_group_chore_document(
  p_group_id    uuid,
  p_recorded_at timestamptz
)
returns table(version integer, changed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_chores  jsonb;
  next_chores     jsonb;
  current_version integer;
  household_zone  text;
  household_today date;
begin
  select chores, docs_version, timezone
    into current_chores, current_version, household_zone
  from public.groups
  where id = p_group_id
  for update;

  if current_version is null then
    raise exception 'That group no longer exists';
  end if;

  household_today := (p_recorded_at at time zone household_zone)::date;

  select coalesce(
    jsonb_agg(
      public.rollover_chore_json(chore, household_today, p_recorded_at)
      order by position
    ),
    '[]'::jsonb
  ) into next_chores
  from jsonb_array_elements(coalesce(current_chores, '[]'::jsonb))
       with ordinality as chores(chore, position);

  if next_chores is not distinct from current_chores then
    return query select current_version, false;
    return;
  end if;

  update public.groups
  set chores = next_chores,
      docs_version = current_version + 1
  where id = p_group_id;

  return query select current_version + 1, true;
end;
$$;

revoke all on function public.reconcile_group_chore_document(uuid, timestamptz)
  from public, anon, authenticated;

create or replace function public.reconcile_group_chores(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;

  select version into next_version
  from public.reconcile_group_chore_document(p_group_id, clock_timestamp());
  return next_version;
end;
$$;

create or replace function public.reconcile_my_chore_rotations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  membership record;
  changed_groups integer := 0;
  did_change boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  for membership in
    select group_id
    from public.group_members
    where user_id = auth.uid()
    order by group_id
  loop
    select changed into did_change
    from public.reconcile_group_chore_document(
      membership.group_id,
      clock_timestamp()
    );
    if did_change then
      changed_groups := changed_groups + 1;
    end if;
  end loop;

  return changed_groups;
end;
$$;

create or replace function public.reconcile_all_chore_rotations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  household record;
  changed_groups integer := 0;
  did_change boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed';
  end if;

  for household in select id from public.groups order by id loop
    select changed into did_change
    from public.reconcile_group_chore_document(
      household.id,
      clock_timestamp()
    );
    if did_change then
      changed_groups := changed_groups + 1;
    end if;
  end loop;

  return changed_groups;
end;
$$;

revoke all on function public.reconcile_group_chores(uuid) from public, anon;
revoke all on function public.reconcile_my_chore_rotations() from public, anon;
revoke all on function public.reconcile_all_chore_rotations()
  from public, anon, authenticated;
grant execute on function public.reconcile_group_chores(uuid) to authenticated;
grant execute on function public.reconcile_my_chore_rotations() to authenticated;
grant execute on function public.reconcile_all_chore_rotations() to service_role;

-- A member may turn exactly one of their own automatically-created
-- not_confirmed entries into reported_later. Schedule fields and every other
-- history entry must remain byte-for-byte unchanged.
create or replace function public.is_valid_chore_late_report(
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
  old_history jsonb;
  new_history jsonb;
  old_entry   jsonb;
  new_entry   jsonb;
  changed_entries integer;
begin
  if (old_chore - 'history') is distinct from (new_chore - 'history') then
    return false;
  end if;

  old_history := coalesce(old_chore -> 'history', '[]'::jsonb);
  new_history := coalesce(new_chore -> 'history', '[]'::jsonb);
  if jsonb_typeof(old_history) <> 'array'
     or jsonb_typeof(new_history) <> 'array'
     or jsonb_array_length(old_history) <> jsonb_array_length(new_history) then
    return false;
  end if;

  select count(*) into changed_entries
  from jsonb_array_elements(old_history) with ordinality as old_rows(entry, n)
  join jsonb_array_elements(new_history) with ordinality as new_rows(entry, n)
    using (n)
  where old_rows.entry is distinct from new_rows.entry;

  if changed_entries <> 1 then
    return false;
  end if;

  select old_rows.entry, new_rows.entry into old_entry, new_entry
  from jsonb_array_elements(old_history) with ordinality as old_rows(entry, n)
  join jsonb_array_elements(new_history) with ordinality as new_rows(entry, n)
    using (n)
  where old_rows.entry is distinct from new_rows.entry
  limit 1;

  return old_entry ->> 'outcome' = 'not_confirmed'
     and old_entry ->> 'assigneeId' = p_member_id::text
     and jsonb_typeof(new_entry -> 'completedAt') = 'string'
     and new_entry = old_entry || jsonb_build_object(
       'outcome', 'reported_later',
       'completedAt', new_entry ->> 'completedAt'
     );
exception
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
         )
         and not public.is_valid_chore_late_report(
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
