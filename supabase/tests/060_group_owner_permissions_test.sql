-- ============================================================================
-- The group creator remains the household owner after handing off treasury.
-- Ownership grants household-management powers, never financial authority.
-- ============================================================================

begin;
set local search_path = public, extensions, tests;

select plan(23);

select tests.logout();
delete from tests.ctx;

select tests.remember(
  'owner', tests.create_user('owner@example.com', 'Owner')::text
);
select tests.remember(
  'friend', tests.create_user('friend@example.com', 'Friend')::text
);
select tests.remember(
  'member', tests.create_user('member@example.com', 'Member')::text
);
select tests.remember(
  'outsider', tests.create_user('outsider@example.com', 'Outsider')::text
);

select tests.login_as(tests.recall_uuid('owner'));
select tests.remember(
  'group', public.create_group('Owner House', 'America/New_York')::text
);
select tests.remember(
  'code', (select code from public.groups where id = tests.recall_uuid('group'))
);

select tests.login_as(tests.recall_uuid('friend'));
select public.join_group(tests.recall('code'), 'Friend', '@friend');

select tests.login_as(tests.recall_uuid('member'));
select public.join_group(tests.recall('code'), 'Member', '@member');

select tests.logout();
select tests.remember('owner_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('owner')
));
select tests.remember('friend_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('friend')
));
select tests.remember('member_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group')
    and user_id = tests.recall_uuid('member')
));

-- The creator hands treasury to a friend but remains the owner.
select tests.login_as(tests.recall_uuid('owner'));

select lives_ok(
  format(
    'select public.transfer_treasurer(%L, %L)',
    tests.recall('group'), tests.recall('friend_member')
  ),
  'the creator can hand treasury to a friend'
);

select is(
  (select is_treasurer from public.group_members
   where id = tests.recall_uuid('owner_member')),
  false,
  'the owner is no longer treasurer after the handoff'
);

select is(
  (select is_treasurer from public.group_members
   where id = tests.recall_uuid('friend_member')),
  true,
  'the friend becomes the one treasurer'
);

select ok(
  public.is_group_owner(tests.recall_uuid('group')),
  'the creator is still recognized as the group owner'
);

select ok(
  public.can_manage_group(tests.recall_uuid('group')),
  'the non-treasurer owner retains household-management authority'
);

select throws_ok(
  format(
    'update public.group_members set is_treasurer = false where id = %L',
    tests.recall('friend_member')
  ),
  'Treasurer changes must use transfer_treasurer',
  'even the owner must use the atomic transfer RPC for role changes'
);

select is(
  tests.rows_affected(format(
    'update public.groups set name = ''Owner-managed House'' where id = %L',
    tests.recall('group')
  )),
  1,
  'the owner can update group settings'
);

select is(
  public.update_group_docs(
    tests.recall_uuid('group'),
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id', 'owner-chore',
      'name', 'Clean kitchen',
      'icon', 'sponge',
      'everyDays', 2,
      'nextDue', '2026-10-20',
      'assignMode', 'fixed',
      'assigneeId', tests.recall('owner_member'),
      'rotationIds', '[]'::jsonb,
      'rotationIndex', 0,
      'history', '[]'::jsonb
    )),
    0
  ),
  1,
  'the owner can add a chore after transferring treasury'
);

select is(
  public.update_group_docs(
    tests.recall_uuid('group'),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_set(
        (select chores -> 0 from public.groups
         where id = tests.recall_uuid('group')),
        '{everyDays}',
        '7'::jsonb
      )
    ),
    1
  ),
  2,
  'the owner can edit an existing chore schedule'
);

select throws_ok(
  format(
    'update public.groups set created_by = %L where id = %L',
    tests.recall('friend'), tests.recall('group')
  ),
  'Group ownership cannot be changed',
  'ownership cannot be reassigned through a raw group update'
);

-- A plain member gets none of the new manager privileges.
select tests.login_as(tests.recall_uuid('member'));

select ok(
  not public.can_manage_group(tests.recall_uuid('group')),
  'an ordinary member is not a group manager'
);

select throws_ok(
  format(
    $sql$
      select public.update_group_docs(
        %L,
        '[]'::jsonb,
        jsonb_build_array(
          jsonb_set(
            (select chores -> 0 from public.groups where id = %L),
            '{everyDays}',
            '9'::jsonb
          )
        ),
        2
      )
    $sql$,
    tests.recall('group'), tests.recall('group')
  ),
  'Only the group owner or treasurer can edit chores',
  'an ordinary member still cannot rewrite a chore schedule'
);

select throws_ok(
  format(
    'select public.transfer_treasurer(%L, %L)',
    tests.recall('group'), tests.recall('member_member')
  ),
  'Only the group owner or current treasurer can hand over the role',
  'an ordinary member cannot assign the treasurer role'
);

-- Ownership does not grant financial authority.
select tests.login_as(tests.recall_uuid('owner'));

insert into public.expenses
  (group_id, submitted_by, submitted_by_name, description, amount)
values (
  tests.recall_uuid('group'),
  tests.recall_uuid('owner_member'),
  'Owner',
  'House supplies',
  30
);

select tests.remember('expense', (
  select id::text from public.expenses
  where group_id = tests.recall_uuid('group') and description = 'House supplies'
));

select throws_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb)',
    tests.recall('expense'),
    json_build_object(tests.recall('owner_member'), 30)::text
  ),
  'Only the treasurer can approve expenses',
  'the owner cannot approve an expense while someone else is treasurer'
);

select throws_ok(
  format(
    'insert into public.rent (group_id, amount, split_type) values (%L, 3000, ''equal'')',
    tests.recall('group')
  ),
  '42501',
  null::text,
  'the owner cannot set rent while someone else is treasurer'
);

select tests.login_as(tests.recall_uuid('friend'));

select lives_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb, ''subset'')',
    tests.recall('expense'),
    json_build_object(tests.recall('owner_member'), 30)::text
  ),
  'the treasurer still controls expense approval'
);

select ok(
  public.can_manage_group(tests.recall_uuid('group')),
  'the treasurer also retains household-management authority'
);

select is(
  tests.rows_affected(format(
    'delete from public.group_members where id = %L',
    tests.recall('owner_member')
  )),
  0,
  'the treasurer cannot remove the group owner'
);

select tests.login_as(tests.recall_uuid('owner'));

select is(
  tests.rows_affected(format(
    'delete from public.group_members where id = %L',
    tests.recall('member_member')
  )),
  1,
  'the owner can remove a settled ordinary member'
);

select lives_ok(
  format(
    'select public.transfer_treasurer(%L, %L)',
    tests.recall('group'), tests.recall('owner_member')
  ),
  'the owner can reclaim the treasurer role later'
);

select is(
  (select is_treasurer from public.group_members
   where id = tests.recall_uuid('owner_member')),
  true,
  'reclaiming treasury promotes the owner'
);

select is(
  (select is_treasurer from public.group_members
   where id = tests.recall_uuid('friend_member')),
  false,
  'reclaiming treasury demotes the previous treasurer'
);

select tests.login_as(tests.recall_uuid('outsider'));

select ok(
  not public.can_manage_group(tests.recall_uuid('group')),
  'an outsider has no management authority'
);

select * from finish();
rollback;
