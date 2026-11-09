-- Let the treasurer report that a roommate paid without pretending to be that
-- roommate. The claim still starts pending, preserving the existing two-sided
-- confirmation trail; either the recipient or treasurer can review it through
-- confirm_payment.

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (
    status = 'pending'
    and (
      from_id = public.my_member_id(group_id)
      or public.is_group_treasurer(group_id)
    )
  );
