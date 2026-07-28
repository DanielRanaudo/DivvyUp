-- ============================================================================
-- Keep the ledger when someone moves out
-- ============================================================================
-- expenses.submitted_by and payments.from_id/to_id cascaded on delete, so
-- removing a membership erased every expense that person had submitted and
-- every payment they were part of. Those rows are what the remaining balances
-- are computed from: deleting them silently changed what everyone else owed.
--
-- Setting the reference to null instead keeps the row. The display name is
-- already denormalised onto submitted_by_name / from_name / to_name, so the
-- history still reads correctly after the person is gone.
--
-- The app only allows removing a member whose balance is zero (see
-- canRemoveMember in src/lib/members.ts), and at a zero balance the charges and
-- payments involving them cancel out — so the people left behind are unaffected.
-- ============================================================================

alter table public.expenses
  drop constraint if exists expenses_submitted_by_fkey;
alter table public.expenses
  add constraint expenses_submitted_by_fkey
    foreign key (submitted_by) references public.group_members(id)
    on delete set null;

alter table public.payments
  drop constraint if exists payments_from_id_fkey;
alter table public.payments
  add constraint payments_from_id_fkey
    foreign key (from_id) references public.group_members(id)
    on delete set null;

alter table public.payments
  drop constraint if exists payments_to_id_fkey;
alter table public.payments
  add constraint payments_to_id_fkey
    foreign key (to_id) references public.group_members(id)
    on delete set null;
