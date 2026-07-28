-- ============================================================================
-- Monthly close-out and archiving
-- ============================================================================
-- Until now a group's ledger only grew: rent charged in March was still an open
-- debt in November, and every load fetched the entire history.
--
-- Closing a month draws a line under it. The one-off rows from that month are
-- marked archived (so they stop counting and stop being loaded) and whatever
-- was still owed at that moment is written to group_periods.carryover, a short
-- list of "A owes B this much" that keeps the debt alive on its own.
--
-- The carry-forward is calculated by the client and passed in. That is
-- deliberate: the balance rules live in TypeScript (rent splits, subgroup
-- bills and chore-driven charges are JSON documents, not tables), and closing
-- the books is a treasurer action over the treasurer's own numbers. The
-- function still enforces *who* may close and that the shape is sane.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Archive columns
-- ---------------------------------------------------------------------------

alter table public.expenses
  add column if not exists archived boolean not null default false,
  add column if not exists period   date;

alter table public.payments
  add column if not exists archived boolean not null default false,
  add column if not exists period   date;

alter table public.utilities
  add column if not exists archived boolean not null default false,
  add column if not exists period   date;

-- The common read is "everything still open for this group", and the archive
-- view asks for one month at a time.
create index if not exists idx_expenses_open
  on public.expenses(group_id) where not archived;
create index if not exists idx_payments_open
  on public.payments(group_id) where not archived;
create index if not exists idx_expenses_period
  on public.expenses(group_id, period);
create index if not exists idx_payments_period
  on public.payments(group_id, period);


-- ---------------------------------------------------------------------------
-- 2. The closed months themselves
-- ---------------------------------------------------------------------------

create table if not exists public.group_periods (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  -- First day of the month that was closed.
  period     date not null,
  closed_at  timestamptz not null default now(),
  closed_by  uuid references public.group_members(id) on delete set null,
  -- [{ fromId, fromName, toId, toName, amount }]
  carryover  jsonb not null default '[]',
  -- { spend, expenses, payments }
  totals     jsonb not null default '{}',
  unique (group_id, period)
);

create index if not exists idx_group_periods_group
  on public.group_periods(group_id, period);

grant select, insert, update, delete on public.group_periods to authenticated;

alter table public.group_periods enable row level security;

-- Everyone in the house can see the history; only close_period writes it.
drop policy if exists periods_select on public.group_periods;
create policy periods_select on public.group_periods
  for select using (public.is_group_member(group_id));

drop policy if exists periods_delete on public.group_periods;
create policy periods_delete on public.group_periods
  for delete using (public.is_group_treasurer(group_id));


-- ---------------------------------------------------------------------------
-- 3. close_period
-- ---------------------------------------------------------------------------

create or replace function public.close_period(
  p_group_id  uuid,
  p_period    date,
  p_carryover jsonb,
  p_totals    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  entry  jsonb;
begin
  if not public.is_group_treasurer(p_group_id) then
    raise exception 'Only the treasurer can close the month';
  end if;

  if p_period is null then
    raise exception 'A close needs the month it covers';
  end if;

  if p_period > (date_trunc('month', now()) + interval '1 month')::date then
    raise exception 'That month has not happened yet';
  end if;

  if exists (
    select 1 from public.group_periods
    where group_id = p_group_id and period = p_period
  ) then
    raise exception 'That month has already been closed';
  end if;

  if jsonb_typeof(coalesce(p_carryover, '[]'::jsonb)) <> 'array' then
    raise exception 'The carry-forward must be a list of debts';
  end if;

  -- A debt has to be between two people in this group, for a positive amount.
  for entry in
    select * from jsonb_array_elements(coalesce(p_carryover, '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.group_members
      where id = (entry->>'fromId')::uuid and group_id = p_group_id
    ) or not exists (
      select 1 from public.group_members
      where id = (entry->>'toId')::uuid and group_id = p_group_id
    ) then
      raise exception 'A carried-forward debt names someone outside this group';
    end if;

    if coalesce((entry->>'amount')::numeric, 0) <= 0 then
      raise exception 'A carried-forward debt must be above zero';
    end if;
  end loop;

  insert into public.group_periods
    (group_id, period, closed_by, carryover, totals)
  values (
    p_group_id,
    p_period,
    public.my_member_id(p_group_id),
    coalesce(p_carryover, '[]'::jsonb),
    coalesce(p_totals, '{}'::jsonb)
  )
  returning id into new_id;

  -- Anything still being decided stays in the new month: an expense nobody has
  -- approved and a payment nobody has confirmed are live business, not history.
  update public.expenses
  set archived = true, period = p_period
  where group_id = p_group_id and not archived and status <> 'pending';

  update public.payments
  set archived = true, period = p_period
  where group_id = p_group_id and not archived and status <> 'pending';

  -- Recurring bills charge again next month, so only one-offs are archived.
  update public.utilities
  set archived = true, period = p_period
  where group_id = p_group_id and not archived and not recurring;

  return new_id;
end;
$$;

grant execute on function public.close_period(uuid, date, jsonb, jsonb)
  to authenticated;
