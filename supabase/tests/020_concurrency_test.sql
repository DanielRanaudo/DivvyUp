-- ============================================================================
-- Covers concurrency/history plus chore authorization and smart rotations.
-- ============================================================================
-- Chores and subgroups are stored as whole JSON documents, so the only thing
-- standing between two simultaneous editors and a silently discarded edit is the
-- version check in update_group_docs. And member removal used to delete the
-- expense and payment rows the remaining balances were computed from.
-- ============================================================================

begin;
set local search_path = public, extensions, tests;

select plan(21);

select tests.logout();
delete from tests.ctx;

select tests.remember('dev', tests.create_user('dev@example.com', 'Dev')::text);
select tests.remember('rae', tests.create_user('rae@example.com', 'Rae')::text);
select tests.remember('outsider', tests.create_user('nope@example.com', 'Nope')::text);
select tests.remember(
  'newcomer', tests.create_user('newcomer@example.com', 'Newcomer')::text
);

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
  -- Null, not the description: pgTAP would otherwise compare the description
  -- against the message the RPC actually raises. See the note in 010.
  null::text,
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

select throws_ok(
  format(
    'select public.update_group_docs(%L, ''[]''::jsonb, ''[{"id":"b"}]''::jsonb, 2)',
    tests.recall('group')
  ),
  'Only the treasurer can delete chores',
  'a member cannot delete another roommate''s chore'
);

select is(
  (select chores from public.groups where id = tests.recall_uuid('group')),
  '[{"id":"a"},{"id":"b"}]'::jsonb,
  'the refused deletion leaves every chore intact'
);

select tests.login_as(tests.recall_uuid('dev'));

select is(
  public.update_group_docs(
    tests.recall_uuid('group'), '[]'::jsonb, '[{"id":"b"}]'::jsonb, 2
  ),
  3,
  'the treasurer can delete a chore'
);

select is(
  public.update_group_docs(
    tests.recall_uuid('group'),
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id', 'assigned',
      'name', 'Dishes',
      'icon', 'plate',
      'everyDays', 2,
      'nextDue', '2026-10-13',
      'assignMode', 'rotation',
      'assigneeId', tests.recall('rae_member'),
      'rotationIds', jsonb_build_array(
        tests.recall('rae_member'), tests.recall('dev_member')
      ),
      'rotationIndex', 0,
      'history', '[]'::jsonb
    )),
    3
  ),
  4,
  'the treasurer can create a full rotating chore'
);

select tests.login_as(tests.recall_uuid('rae'));

select throws_ok(
  format(
    $sql$
      select public.update_group_docs(
        %L,
        '[]'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'id', 'assigned',
          'name', 'Dishes',
          'icon', 'plate',
          'everyDays', 7,
          'nextDue', '2026-10-13',
          'assignMode', 'rotation',
          'assigneeId', %L,
          'rotationIds', jsonb_build_array(%L),
          'rotationIndex', 0,
          'history', '[]'::jsonb
        )),
        4
      )
    $sql$,
    tests.recall('group'),
    tests.recall('rae_member'),
    tests.recall('rae_member')
  ),
  'Only the treasurer can edit chores',
  'a member cannot change a chore frequency or rotation'
);

select is(
  public.update_group_docs(
    tests.recall_uuid('group'),
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id', 'assigned',
      'name', 'Dishes',
      'icon', 'plate',
      'everyDays', 2,
      'nextDue', '2026-10-15',
      'assignMode', 'rotation',
      'assigneeId', tests.recall('dev_member'),
      'rotationIds', jsonb_build_array(
        tests.recall('rae_member'), tests.recall('dev_member')
      ),
      'rotationIndex', 1,
      'history', jsonb_build_array(jsonb_build_object(
        'date', '2026-10-13',
        'assigneeId', tests.recall('rae_member'),
        'completedAt', '2026-10-13T12:00:00.000Z'
      ))
    )),
    4
  ),
  5,
  'the assigned member can still complete a chore'
);

select tests.login_as(tests.recall_uuid('dev'));

select is(
  public.update_group_docs(
    tests.recall_uuid('group'),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_set(
        jsonb_set(
          (select chores -> 0 from public.groups where id = tests.recall_uuid('group')),
          '{everyDays}',
          '4'::jsonb
        ),
        '{smartRotation}',
        'true'::jsonb
      ),
      jsonb_build_object(
        'id', 'custom',
        'name', 'Custom rotation',
        'icon', 'custom',
        'everyDays', 3,
        'nextDue', '2026-10-15',
        'assignMode', 'rotation',
        'smartRotation', false,
        'assigneeId', tests.recall('dev_member'),
        'rotationIds', jsonb_build_array(tests.recall('dev_member')),
        'rotationIndex', 0,
        'history', '[]'::jsonb
      )
    ),
    5
  ),
  6,
  'the treasurer can edit an existing chore schedule'
);

select tests.login_as(tests.recall_uuid('newcomer'));
select public.join_group(tests.recall('code'), 'Newcomer', '@newcomer');

select tests.logout();
select tests.remember('newcomer_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('newcomer')
));

select ok(
  (select chores -> 0 -> 'rotationIds' from public.groups
   where id = tests.recall_uuid('group'))
    @> jsonb_build_array(tests.recall('newcomer_member')),
  'joining the group adds the new roommate to a smart rotation'
);

select ok(
  not (
    (select chores -> 1 -> 'rotationIds' from public.groups
     where id = tests.recall_uuid('group'))
      @> jsonb_build_array(tests.recall('newcomer_member'))
  ),
  'joining the group leaves a custom rotation alone'
);

select is(
  (select docs_version from public.groups where id = tests.recall_uuid('group')),
  7,
  'automatic enrollment advances the chore document version'
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
