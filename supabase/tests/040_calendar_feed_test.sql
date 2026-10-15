-- ============================================================================
-- Private iCalendar feed tokens: bearer secrecy, RLS, rotation and data scope
-- ============================================================================

begin;
set local search_path = public, extensions, tests;

select plan(19);

select tests.logout();
delete from tests.ctx;

select tests.remember('alex', tests.create_user('calendar-alex@example.com', 'Alex')::text);
select tests.remember('bea', tests.create_user('calendar-bea@example.com', 'Bea')::text);

select tests.login_as(tests.recall_uuid('alex'));
select tests.remember('group', public.create_group('Calendar House')::text);
select tests.remember(
  'code',
  (select code from public.groups where id = tests.recall_uuid('group'))
);

select tests.login_as(tests.recall_uuid('bea'));
select public.join_group(tests.recall('code'), 'Bea', '');

select tests.logout();
select tests.remember('alex_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('alex')
));
select tests.remember('bea_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('bea')
));

select tests.login_as(tests.recall_uuid('alex'));
select public.update_group_docs(
  tests.recall_uuid('group'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'id', 'alex-fixed', 'name', 'Alex chore', 'icon', 'A',
      'everyDays', 7, 'nextDue', '2026-10-15', 'assignMode', 'fixed',
      'assigneeId', tests.recall('alex_member'), 'rotationIds', '[]'::jsonb,
      'rotationIndex', 0, 'history', '[]'::jsonb
    ),
    jsonb_build_object(
      'id', 'bea-fixed', 'name', 'Bea-only chore', 'icon', 'B',
      'everyDays', 7, 'nextDue', '2026-10-15', 'assignMode', 'fixed',
      'assigneeId', tests.recall('bea_member'), 'rotationIds', '[]'::jsonb,
      'rotationIndex', 0, 'history', '[]'::jsonb
    ),
    jsonb_build_object(
      'id', 'shared-rotation', 'name', 'Rotating chore', 'icon', 'R',
      'everyDays', 2, 'nextDue', '2026-10-15', 'assignMode', 'rotation',
      'assigneeId', tests.recall('alex_member'),
      'rotationIds', jsonb_build_array(
        tests.recall('alex_member'), tests.recall('bea_member')
      ),
      'rotationIndex', 0, 'history', '[]'::jsonb
    ),
    jsonb_build_object(
      'id', 'completed-once', 'name', 'Completed one-off', 'icon', 'C',
      'everyDays', 0, 'nextDue', '2026-10-15', 'assignMode', 'fixed',
      'assigneeId', tests.recall('alex_member'), 'rotationIds', '[]'::jsonb,
      'rotationIndex', 0,
      'history', jsonb_build_array(jsonb_build_object(
        'date', '2026-10-15', 'assigneeId', tests.recall('alex_member'),
        'completedAt', '2026-10-15T12:00:00Z'
      ))
    )
  ),
  0
);

select tests.logout();
select has_table('public', 'calendar_feed_tokens', 'calendar feed tokens have their own table');
select has_function('public', 'rotate_calendar_feed_token', 'a signed-in user can rotate their feed token');
select has_function('public', 'read_calendar_feed', array['text'], 'the public feed has one narrow read function');

select throws_ok(
  'select public.rotate_calendar_feed_token()',
  'Not authenticated',
  'a signed-out caller cannot create a feed token'
);

select tests.login_as(tests.recall_uuid('alex'));
select tests.remember('token', public.rotate_calendar_feed_token());

select is(length(tests.recall('token')), 64, 'a feed token carries 256 random bits as hex');
select isnt(
  (select token_hash from public.calendar_feed_tokens where user_id = tests.recall_uuid('alex')),
  tests.recall('token'),
  'the raw bearer token is not stored'
);
select is(
  (select count(*)::integer from public.calendar_feed_tokens),
  1,
  'a user can read their own feed metadata'
);

select tests.login_as(tests.recall_uuid('bea'));
select is(
  (select count(*)::integer from public.calendar_feed_tokens),
  0,
  'another roommate cannot read feed metadata'
);
select is(
  tests.rows_affected('delete from public.calendar_feed_tokens'),
  0,
  'another roommate cannot disable the feed'
);

select tests.logout();
select isnt(
  public.read_calendar_feed(tests.recall('token')),
  null::jsonb,
  'the bearer token opens a calendar feed'
);
select is(
  jsonb_array_length(public.read_calendar_feed(tests.recall('token')) -> 'groups'),
  1,
  'the feed contains the owner''s household'
);
select is(
  jsonb_array_length(
    public.read_calendar_feed(tests.recall('token')) -> 'groups' -> 0 -> 'chores'
  ),
  2,
  'the feed RPC returns only own fixed chores and rotations that include the owner'
);
select is(
  public.read_calendar_feed(tests.recall('token'))
    -> 'groups' -> 0 -> 'chores' -> 1 ->> 'name',
  'Rotating chore',
  'another roommate''s fixed chore and a completed one-off stay out of the feed'
);
select is(
  jsonb_array_length(
    public.read_calendar_feed(tests.recall('token'))
      -> 'groups' -> 0 -> 'chores' -> 1 -> 'history'
  ),
  0,
  'calendar access does not expose chore history'
);

select tests.login_as(tests.recall_uuid('alex'));
select tests.remember('replacement', public.rotate_calendar_feed_token());
select isnt(
  tests.recall('replacement'),
  tests.recall('token'),
  'rotation creates a different private token'
);

select tests.logout();
select is(
  public.read_calendar_feed(tests.recall('token')),
  null::jsonb,
  'rotation immediately invalidates the old link'
);
select isnt(
  public.read_calendar_feed(tests.recall('replacement')),
  null::jsonb,
  'the replacement link is active'
);

select tests.login_as(tests.recall_uuid('alex'));
select is(
  tests.rows_affected('delete from public.calendar_feed_tokens'),
  1,
  'the owner can disable their feed'
);
select tests.logout();
select is(
  public.read_calendar_feed(tests.recall('replacement')),
  null::jsonb,
  'a disabled feed no longer returns household data'
);

select * from finish();
rollback;

