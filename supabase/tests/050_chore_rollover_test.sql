-- ==========================================================================
-- Chore rollover: deterministic advancement, history, and correction rights
-- ==========================================================================

begin;
set local search_path = public, extensions, tests;

select plan(21);

select tests.logout();
delete from tests.ctx;

select tests.remember(
  'owner', tests.create_user('rollover-owner@example.com', 'Owner')::text
);
select tests.remember(
  'member', tests.create_user('rollover-member@example.com', 'Member')::text
);
select tests.remember(
  'outsider', tests.create_user('rollover-outsider@example.com', 'Outsider')::text
);

select tests.login_as(tests.recall_uuid('owner'));
select tests.remember(
  'group',
  public.create_group('Rollover House', 'America/New_York')::text
);
select tests.remember(
  'code',
  (select code from public.groups where id = tests.recall_uuid('group'))
);

select tests.login_as(tests.recall_uuid('member'));
select public.join_group(tests.recall('code'), 'Member', '');

select tests.logout();
select tests.remember('owner_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('owner')
));
select tests.remember('member_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('member')
));

select is(
  (select timezone from public.groups where id = tests.recall_uuid('group')),
  'America/New_York',
  'a new household stores its IANA timezone'
);

select throws_ok(
  format(
    'update public.groups set timezone = ''Mars/Olympus'' where id = %L',
    tests.recall('group')
  ),
  '22023',
  null::text,
  'an invalid timezone cannot brick a household schedule'
);

select is(
  public.rollover_chore_json(
    jsonb_build_object(
      'id', 'one-off', 'everyDays', 0, 'nextDue', '2026-01-01',
      'assignMode', 'fixed', 'assigneeId', tests.recall('member_member'),
      'rotationIds', '[]'::jsonb, 'rotationIndex', 0,
      'history', '[]'::jsonb
    ),
    '2026-10-16'::date,
    '2026-10-16T12:00:00Z'::timestamptz
  ),
  jsonb_build_object(
    'id', 'one-off', 'everyDays', 0, 'nextDue', '2026-01-01',
    'assignMode', 'fixed', 'assigneeId', tests.recall('member_member'),
    'rotationIds', '[]'::jsonb, 'rotationIndex', 0,
    'history', '[]'::jsonb
  ),
  'one-time chores never roll automatically'
);

select is(
  public.rollover_chore_json(
    jsonb_build_object(
      'id', 'fixed', 'everyDays', 2, 'nextDue', '2026-10-10',
      'assignMode', 'fixed', 'assigneeId', tests.recall('member_member'),
      'rotationIds', '[]'::jsonb, 'rotationIndex', 0,
      'history', '[]'::jsonb
    ),
    '2026-10-11'::date,
    '2026-10-11T12:00:00Z'::timestamptz
  ) ->> 'nextDue',
  '2026-10-10',
  'a chore stays open until the next occurrence begins'
);

update public.groups
set chores = jsonb_build_array(jsonb_build_object(
  'id', 'rotation',
  'name', 'Kitchen',
  'icon', 'K',
  'everyDays', 2,
  'nextDue', '2026-10-10',
  'assignMode', 'rotation',
  'assigneeId', tests.recall('member_member'),
  'rotationIds', jsonb_build_array(
    tests.recall('member_member'), tests.recall('owner_member')
  ),
  'rotationIndex', 0,
  'history', '[]'::jsonb
))
where id = tests.recall_uuid('group');

select results_eq(
  format(
    'select version, changed
     from public.reconcile_group_chore_document(%L, %L::timestamptz)',
    tests.recall('group'), '2026-10-16T12:00:00Z'
  ),
  $$values (1, true)$$,
  'reconciliation reports one version increment for the whole catch-up'
);

select is(
  (select chores -> 0 ->> 'nextDue' from public.groups
   where id = tests.recall_uuid('group')),
  '2026-10-16',
  'three elapsed occurrences advance to the current scheduled date'
);

select is(
  (select chores -> 0 ->> 'assigneeId' from public.groups
   where id = tests.recall_uuid('group')),
  tests.recall('owner_member'),
  'the current assignee advances in lockstep with the due date'
);

select is(
  (select jsonb_agg(entry ->> 'date' order by position)
   from public.groups,
        jsonb_array_elements(chores -> 0 -> 'history')
          with ordinality as rows(entry, position)
   where id = tests.recall_uuid('group')),
  '["2026-10-10", "2026-10-12", "2026-10-14"]'::jsonb,
  'every elapsed scheduled date is preserved in history'
);

select is(
  (select jsonb_agg(entry ->> 'assigneeId' order by position)
   from public.groups,
        jsonb_array_elements(chores -> 0 -> 'history')
          with ordinality as rows(entry, position)
   where id = tests.recall_uuid('group')),
  jsonb_build_array(
    tests.recall('member_member'),
    tests.recall('owner_member'),
    tests.recall('member_member')
  ),
  'history records the assignee from each turn before rotating'
);

select is(
  (select count(*)::integer
   from public.groups,
        jsonb_array_elements(chores -> 0 -> 'history') entry
   where id = tests.recall_uuid('group')
     and entry ->> 'outcome' = 'not_confirmed'),
  3,
  'elapsed unrecorded turns use the neutral not-confirmed outcome'
);

select is(
  (select docs_version from public.groups where id = tests.recall_uuid('group')),
  1,
  'reconciliation advances the shared document version'
);

select results_eq(
  format(
    'select version, changed
     from public.reconcile_group_chore_document(%L, %L::timestamptz)',
    tests.recall('group'), '2026-10-16T12:05:00Z'
  ),
  $$values (1, false)$$,
  'repeating reconciliation at the same date is idempotent'
);

select tests.login_as(tests.recall_uuid('outsider'));
select throws_ok(
  format(
    'select public.reconcile_group_chores(%L)', tests.recall('group')
  ),
  'Not a member of this group',
  'a stranger cannot invoke reconciliation for a household'
);

select tests.login_as(tests.recall_uuid('member'));
select is(
  public.update_group_docs(
    tests.recall_uuid('group'),
    '[]'::jsonb,
    jsonb_set(
      (select chores from public.groups where id = tests.recall_uuid('group')),
      '{0,history,0}',
      (select chores -> 0 -> 'history' -> 0 from public.groups
       where id = tests.recall_uuid('group')) || jsonb_build_object(
        'outcome', 'reported_later',
        'completedAt', '2026-10-16T13:00:00.000Z'
      )
    ),
    1
  ),
  2,
  'the original assignee can report an unconfirmed occurrence later'
);

select is(
  (select chores -> 0 -> 'history' -> 0 ->> 'outcome'
   from public.groups where id = tests.recall_uuid('group')),
  'reported_later',
  'a late report changes only the history outcome'
);

select throws_ok(
  format(
    $sql$
      select public.update_group_docs(
        %L,
        '[]'::jsonb,
        jsonb_set(
          (select chores from public.groups where id = %L),
          '{0,history,1}',
          (select chores -> 0 -> 'history' -> 1 from public.groups
           where id = %L) || jsonb_build_object(
            'outcome', 'reported_later',
            'completedAt', '2026-10-16T13:05:00.000Z'
          )
        ),
        2
      )
    $sql$,
    tests.recall('group'), tests.recall('group'), tests.recall('group')
  ),
  'Only the group owner or treasurer can edit chores',
  'a roommate cannot claim someone else''s unconfirmed occurrence'
);

select throws_ok(
  format(
    $sql$
      select public.update_group_docs(
        %L,
        '[]'::jsonb,
        jsonb_set(
          (select chores from public.groups where id = %L),
          '{0,history,2}',
          (select chores -> 0 -> 'history' -> 2 from public.groups
           where id = %L) || jsonb_build_object(
            'outcome', 'excused',
            'resolvedAt', '2026-10-16T13:10:00.000Z'
          )
        ),
        2
      )
    $sql$,
    tests.recall('group'), tests.recall('group'), tests.recall('group')
  ),
  'Only the group owner or treasurer can edit chores',
  'a non-treasurer cannot excuse even their own occurrence'
);

select tests.login_as(tests.recall_uuid('owner'));
select is(
  public.update_group_docs(
    tests.recall_uuid('group'),
    '[]'::jsonb,
    jsonb_set(
      (select chores from public.groups where id = tests.recall_uuid('group')),
      '{0,history,1}',
      (select chores -> 0 -> 'history' -> 1 from public.groups
       where id = tests.recall_uuid('group')) || jsonb_build_object(
        'outcome', 'excused',
        'resolvedAt', '2026-10-16T13:15:00.000Z'
      )
    ),
    2
  ),
  3,
  'the treasurer can excuse an unconfirmed occurrence'
);

select is(
  (select chores -> 0 -> 'history' -> 1 ->> 'outcome'
   from public.groups where id = tests.recall_uuid('group')),
  'excused',
  'the treasurer correction is stored in shared history'
);

select is(
  (select jsonb_build_array(
     chores -> 0 ->> 'nextDue', chores -> 0 ->> 'assigneeId'
   ) from public.groups where id = tests.recall_uuid('group')),
  jsonb_build_array('2026-10-16', tests.recall('owner_member')),
  'history corrections never rewind the live schedule'
);

select throws_ok(
  'select public.reconcile_all_chore_rotations()',
  '42501',
  null::text,
  'ordinary authenticated users cannot run the all-households service job'
);

select * from finish();
rollback;
