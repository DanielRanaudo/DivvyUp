-- ============================================================================
-- A treasurer may report a payment for a roommate; ordinary members may only
-- report their own. Every report still starts pending for an auditable review.
-- ============================================================================

begin;
set local search_path = public, extensions, tests;

select plan(4);

select tests.logout();
delete from tests.ctx;

select tests.remember(
  'treasurer', tests.create_user('treasurer-payments@example.com', 'Treasurer')::text
);
select tests.remember(
  'payer', tests.create_user('payer@example.com', 'Payer')::text
);
select tests.remember(
  'recipient', tests.create_user('recipient@example.com', 'Recipient')::text
);

select tests.login_as(tests.recall_uuid('treasurer'));
select tests.remember(
  'group', public.create_group('Payment House')::text
);
select tests.remember(
  'code', (select code from public.groups where id = tests.recall_uuid('group'))
);

select tests.login_as(tests.recall_uuid('payer'));
select public.join_group(tests.recall('code'), 'Payer', '@payer');

select tests.login_as(tests.recall_uuid('recipient'));
select public.join_group(tests.recall('code'), 'Recipient', '@recipient');

select tests.logout();
select tests.remember('treasurer_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('treasurer')
));
select tests.remember('payer_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('payer')
));
select tests.remember('recipient_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('recipient')
));

select tests.login_as(tests.recall_uuid('payer'));

select throws_ok(
  format(
    'insert into public.payments
       (group_id, from_id, from_name, to_id, to_name, amount)
     values (%L, %L, ''Recipient'', %L, ''Treasurer'', 12)',
    tests.recall('group'),
    tests.recall('recipient_member'),
    tests.recall('treasurer_member')
  ),
  '42501',
  null::text,
  'an ordinary member cannot report a payment for someone else'
);

select tests.login_as(tests.recall_uuid('treasurer'));

select lives_ok(
  format(
    'insert into public.payments
       (group_id, from_id, from_name, to_id, to_name, amount)
     values (%L, %L, ''Payer'', %L, ''Recipient'', 25)',
    tests.recall('group'),
    tests.recall('payer_member'),
    tests.recall('recipient_member')
  ),
  'the treasurer can report a payment for a roommate'
);

select is(
  (select status from public.payments
   where group_id = tests.recall_uuid('group') and amount = 25),
  'pending',
  'a treasurer-reported payment still starts pending'
);

select throws_ok(
  format(
    'insert into public.payments
       (group_id, from_id, from_name, to_id, to_name, amount, status)
     values (%L, %L, ''Payer'', %L, ''Recipient'', 99, ''confirmed'')',
    tests.recall('group'),
    tests.recall('payer_member'),
    tests.recall('recipient_member')
  ),
  '42501',
  null::text,
  'even the treasurer cannot skip the pending audit state on insert'
);

select * from finish();
rollback;
