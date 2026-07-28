-- ============================================================================
-- Flexible expense splits
-- ============================================================================
-- Every approved expense was divided evenly across everyone in the group, with
-- no way to leave out the roommate who wasn't there. approve_expense already
-- accepts arbitrary splits and checks that they add up, so the only thing
-- missing is a record of what the treasurer meant.
--
-- The amounts in `splits` stay authoritative. `split_mode` exists so the UI can
-- say "split between 3" rather than "custom", and so reopening an expense can
-- put the treasurer back in the mode they used.
-- ============================================================================

alter table public.expenses
  add column if not exists split_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_split_mode_valid'
  ) then
    alter table public.expenses
      add constraint expenses_split_mode_valid check (
        split_mode is null
        or split_mode in ('even', 'subset', 'exact', 'percentage')
      );
  end if;
end;
$$;

-- The signature gains the mode, so the two-argument version has to go rather
-- than remain as an ambiguous overload.
drop function if exists public.approve_expense(uuid, jsonb);

create or replace function public.approve_expense(
  p_expense_id uuid,
  p_splits     jsonb,
  p_mode       text default 'even'
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

  if p_mode is not null
     and p_mode not in ('even', 'subset', 'exact', 'percentage') then
    raise exception 'Unknown split mode';
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
  set status     = 'approved',
      splits     = p_splits,
      split_mode = coalesce(p_mode, 'even')
  where id = p_expense_id;
end;
$$;

grant execute on function public.approve_expense(uuid, jsonb, text) to authenticated;

-- Reopening drops the splits, so the mode it was approved under goes too.
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
  set status     = 'pending',
      splits     = null,
      split_mode = null
  where id = p_expense_id;
end;
$$;
