-- ============================================================================
-- Covers 20260727160000_periods.sql
-- ============================================================================
-- Closing a month is the one action that decides what still counts. It has to
-- be the treasurer's alone, it has to leave undecided business open, and the
-- debts it carries forward have to be between people who are actually in the
-- house — otherwise the carry-forward becomes a way to invent a debt.
-- ============================================================================

begin;
set local search_path = public, extensions, tests;

select plan(12);

select tests.logout();
delete from tests.ctx;

select tests.remember('dev', tests.create_user('dev@example.com', 'Dev')::text);
select tests.remember('rae', tests.create_user('rae@example.com', 'Rae')::text);

select tests.login_as(tests.recall_uuid('dev'));
select tests.remember('group', public.create_group('Maple St')::text);
select tests.remember(
  'code',
  (select code from public.groups where id = tests.recall_uuid('group'))
);

select tests.login_as(tests.recall_uuid('rae'));
select public.join_group(tests.recall('code'), 'Rae', '@rae');

select tests.logout();
select tests.remember('dev_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group') and user_id = tests.recall_uuid('dev')
));
select tests.remember('rae_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group') and user_id = tests.recall_uuid('rae')
));
select tests.remember('period', date_trunc('month', now())::date::text);

-- One approved expense, one confirmed payment, one still-pending expense.
select tests.login_as(tests.recall_uuid('rae'));
insert into public.expenses
  (group_id, submitted_by, submitted_by_name, description, amount)
values
  (tests.recall_uuid('group'), tests.recall_uuid('rae_member'), 'Rae', 'Router', 60),
  (tests.recall_uuid('group'), tests.recall_uuid('rae_member'), 'Rae', 'Lightbulbs', 12);

select tests.remember('expense', (
  select id::text from public.expenses
  where group_id = tests.recall_uuid('group') and description = 'Router'
));

insert into public.payments
  (group_id, from_id, from_name, to_id, to_name, amount)
values (
  tests.recall_uuid('group'),
  tests.recall_uuid('rae_member'), 'Rae',
  tests.recall_uuid('dev_member'), 'Dev',
  30
);
select tests.remember('payment', (
  select id::text from public.payments where group_id = tests.recall_uuid('group')
));

select tests.login_as(tests.recall_uuid('dev'));
select public.approve_expense(
  tests.recall_uuid('expense'),
  jsonb_build_object(
    tests.recall('dev_member'), 30,
    tests.recall('rae_member'), 30
  ),
  'even'
);
select public.confirm_payment(tests.recall_uuid('payment'), 'confirmed');

-- A one-off bill and a recurring one.
insert into public.utilities (group_id, name, amount, recurring)
values
  (tests.recall_uuid('group'), 'Power', 90, true),
  (tests.recall_uuid('group'), 'Plumber', 200, false);


-- --- Only the treasurer closes the books -----------------------------------

select tests.login_as(tests.recall_uuid('rae'));

select throws_ok(
  format(
    'select public.close_period(%L, %L::date, ''[]''::jsonb, ''{}''::jsonb)',
    tests.recall('group'), tests.recall('period')
  ),
  'Only the treasurer can close the month',
  'a plain member cannot close the month'
);


-- --- The carry-forward cannot invent a debt --------------------------------

select tests.login_as(tests.recall_uuid('dev'));

select throws_ok(
  format(
    'select public.close_period(%L, %L::date, %L::jsonb, ''{}''::jsonb)',
    tests.recall('group'),
    tests.recall('period'),
    jsonb_build_array(jsonb_build_object(
      'fromId', gen_random_uuid(),
      'toId', tests.recall('dev_member'),
      'amount', 40
    ))
  ),
  'A carried-forward debt names someone outside this group',
  'a debt owed by a stranger is refused'
);

select throws_ok(
  format(
    'select public.close_period(%L, %L::date, %L::jsonb, ''{}''::jsonb)',
    tests.recall('group'),
    tests.recall('period'),
    jsonb_build_array(jsonb_build_object(
      'fromId', tests.recall('rae_member'),
      'toId', tests.recall('dev_member'),
      'amount', 0
    ))
  ),
  'A carried-forward debt must be above zero',
  'a debt of nothing is refused'
);

select throws_ok(
  format(
    'select public.close_period(%L, ''2099-01-01''::date, ''[]''::jsonb, ''{}''::jsonb)',
    tests.recall('group')
  ),
  'That month has not happened yet',
  'a month in the future cannot be closed'
);


-- --- Closing ---------------------------------------------------------------

select lives_ok(
  format(
    'select public.close_period(%L, %L::date, %L::jsonb, ''{"spend": 272}''::jsonb)',
    tests.recall('group'),
    tests.recall('period'),
    jsonb_build_array(jsonb_build_object(
      'fromId', tests.recall('rae_member'),
      'fromName', 'Rae',
      'toId', tests.recall('dev_member'),
      'toName', 'Dev',
      'amount', 30
    ))
  ),
  'the treasurer can close the month'
);

select is(
  (select carryover->0->>'amount' from public.group_periods
   where group_id = tests.recall_uuid('group')),
  '30',
  'what was owed at the close is recorded'
);

select is(
  (select closed_by from public.group_periods
   where group_id = tests.recall_uuid('group')),
  tests.recall_uuid('dev_member'),
  'the close records who did it'
);

select is(
  (select count(*) from public.expenses
   where group_id = tests.recall_uuid('group') and archived
     and period = tests.recall('period')::date),
  1::bigint,
  'the approved expense is archived into the month that just closed'
);

select is(
  (select count(*) from public.expenses
   where group_id = tests.recall_uuid('group') and not archived),
  1::bigint,
  'the expense still waiting for approval stays open'
);

select is(
  (select archived from public.payments where id = tests.recall_uuid('payment')),
  true,
  'the confirmed payment is archived'
);

select results_eq(
  format(
    'select name, archived from public.utilities where group_id = %L order by name',
    tests.recall('group')
  ),
  $$values ('Plumber'::text, true), ('Power'::text, false)$$,
  'one-off bills are archived; recurring ones bill again next month'
);

select throws_ok(
  format(
    'select public.close_period(%L, %L::date, ''[]''::jsonb, ''{}''::jsonb)',
    tests.recall('group'), tests.recall('period')
  ),
  'That month has already been closed',
  'the same month cannot be closed twice'
);

select * from finish();
rollback;
