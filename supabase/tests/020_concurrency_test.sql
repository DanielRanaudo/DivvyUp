-- ============================================================================
-- Covers 20260727130000_concurrency.sql and 20260727140000_preserve_history.sql
-- ============================================================================
-- Chores and subgroups are stored as whole JSON documents, so the only thing
-- standing between two simultaneous editors and a silently discarded edit is the
-- version check in update_group_docs. And member removal used to delete the
-- expense and payment rows the remaining balances were computed from.
-- ============================================================================

begin;
set local search_path = public, extensions, tests;

select plan(11);

select tests.logout();
delete from tests.ctx;

select tests.remember('dev', tests.create_user('dev@example.com', 'Dev')::text);
select tests.remember('rae', tests.create_user('rae@example.com', 'Rae')::text);
select tests.remember('outsider', tests.create_user('nope@example.com', 'Nope')::text);

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


-- --- 2d. The version counter on the JSON documents -------------------------

select is(
  (select docs_version from public.groups where id = tests.recall_uuid('group')),
  0,
  'a new group starts at document version zero'
);

select tests.login_as(tests.recall_uuid('dev'));

select is(
  public.update_group_docs(
    tests.recall_uuid('group'), '[]'::jsonb, '[{"id":"a"}]'::jsonb, 0
  ),
  1,
  'writing with the version you read returns the new version'
);

-- Rae read version 0 too, before Dev's write landed. Under the old function
-- this overwrote Dev's chore list without a word.
select tests.login_as(tests.recall_uuid('rae'));

select throws_ok(
  format(
    'select public.update_group_docs(%L, ''[]''::jsonb, ''[{"id":"b"}]''::jsonb, 0)',
    tests.recall('group')
  ),
  '40001',
  'a write based on a stale version is refused with serialization_failure'
);

select is(
  (select chores from public.groups where id = tests.recall_uuid('group')),
  '[{"id":"a"}]'::jsonb,
  'the refused write left the first editor''s chores intact'
);

select is(
  public.update_group_docs(
    tests.recall_uuid('group'), '[]'::jsonb, '[{"id":"a"},{"id":"b"}]'::jsonb, 1
  ),
  2,
  'the second editor succeeds once they have refetched'
);

select tests.login_as(tests.recall_uuid('outsider'));

select throws_ok(
  format(
    'select public.update_group_docs(%L, ''[]''::jsonb, ''[]''::jsonb, 2)',
    tests.recall('group')
  ),
  'Not a member of this group',
  'a stranger cannot rewrite a group''s documents'
);


-- --- 2e. The touch trigger owns updated_at --------------------------------
-- Every statement in this transaction shares one now(), so the test is that a
-- client-supplied value gets overwritten rather than that the clock moved.

select tests.login_as(tests.recall_uuid('rae'));

select lives_ok(
  format(
    'update public.group_members
     set venmo = ''@rae-pay'', updated_at = ''epoch''
     where id = %L',
    tests.recall('rae_member')
  ),
  'a member can update their own row'
);

select is(
  (select updated_at from public.group_members where id = tests.recall_uuid('rae_member')),
  now(),
  'the touch trigger stamps updated_at, ignoring what the client sent'
);


-- --- History survives someone moving out -----------------------------------

insert into public.expenses
  (group_id, submitted_by, submitted_by_name, description, amount)
values (
  tests.recall_uuid('group'), tests.recall_uuid('rae_member'), 'Rae', 'Router', 60
);

insert into public.payments
  (group_id, from_id, from_name, to_id, to_name, amount)
values (
  tests.recall_uuid('group'),
  tests.recall_uuid('rae_member'), 'Rae',
  tests.recall_uuid('dev_member'), 'Dev',
  30
);

select tests.login_as(tests.recall_uuid('dev'));

select is(
  tests.rows_affected(format(
    'delete from public.group_members where id = %L', tests.recall('rae_member')
  )),
  1,
  'the treasurer can remove a member'
);

select results_eq(
  format(
    'select description, submitted_by, submitted_by_name from public.expenses
     where group_id = %L',
    tests.recall('group')
  ),
  $$values ('Router'::text, null::uuid, 'Rae'::text)$$,
  'the departed member''s expense survives with its name intact'
);

select results_eq(
  format(
    'select from_id, from_name, amount from public.payments where group_id = %L',
    tests.recall('group')
  ),
  $$values (null::uuid, 'Rae'::text, 30::numeric)$$,
  'their payment survives too, so the remaining balances still add up'
);

select * from finish();
rollback;
