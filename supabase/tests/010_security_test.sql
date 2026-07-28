-- ============================================================================
-- Proves the holes closed by 20260727120000_security_hardening.sql stay closed
-- ============================================================================
-- Every attack below succeeded against the original schema. None of them needed
-- anything more exotic than the anon key that ships in the browser bundle, so
-- "the UI doesn't offer that button" was never a defence. The database is the
-- only real gate, which is why it is the database that gets tested.
-- ============================================================================

begin;
set local search_path = public, extensions, tests;

select plan(30);

-- --- Cast: a treasurer, a plain member, and an outsider ---------------------

select tests.logout();
delete from tests.ctx;

select tests.remember('alex', tests.create_user('alex@example.com', 'Alex')::text);
select tests.remember('bea',  tests.create_user('bea@example.com', 'Bea')::text);
select tests.remember('cy',   tests.create_user('cy@example.com', 'Cy')::text);

select tests.login_as(tests.recall_uuid('alex'));
select tests.remember('group', public.create_group('Apt 4B')::text);
select tests.remember(
  'code',
  (select code from public.groups where id = tests.recall_uuid('group'))
);

select tests.login_as(tests.recall_uuid('bea'));
select public.join_group(tests.recall('code'), 'Bea', '@bea');

-- Cy runs an unrelated group, to check for cross-group leakage.
select tests.login_as(tests.recall_uuid('cy'));
select tests.remember('other_group', public.create_group('Somewhere else')::text);

select tests.logout();
select tests.remember('alex_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group') and user_id = tests.recall_uuid('alex')
));
select tests.remember('bea_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('group') and user_id = tests.recall_uuid('bea')
));
select tests.remember('cy_member', (
  select id::text from public.group_members
  where group_id = tests.recall_uuid('other_group')
));


-- --- 1a. Membership rows cannot be rewritten into a promotion --------------

select tests.login_as(tests.recall_uuid('bea'));

select throws_ok(
  format(
    'update public.group_members set is_treasurer = true where id = %L',
    tests.recall('bea_member')
  ),
  'Only a treasurer can change who the treasurer is',
  'a member cannot make themselves treasurer'
);

select throws_ok(
  format(
    'update public.group_members set group_id = %L where id = %L',
    tests.recall('other_group'), tests.recall('bea_member')
  ),
  'A membership cannot be moved to another group or user',
  'a member cannot move their membership into another group'
);

select throws_ok(
  format(
    'update public.group_members set user_id = %L where id = %L',
    tests.recall('cy'), tests.recall('bea_member')
  ),
  'A membership cannot be moved to another group or user',
  'a member cannot hand their membership to someone else'
);

select lives_ok(
  format(
    'update public.group_members set venmo = ''@bea-pay'' where id = %L',
    tests.recall('bea_member')
  ),
  'a member can still edit their own payment details'
);


-- --- 1b. Submissions start pending, with the splits left blank -------------

select throws_ok(
  format(
    'insert into public.expenses
       (group_id, submitted_by, submitted_by_name, description, amount, status)
     values (%L, %L, ''Bea'', ''Free money'', 500, ''approved'')',
    tests.recall('group'), tests.recall('bea_member')
  ),
  '42501',
  'a member cannot insert an expense that is already approved'
);

select throws_ok(
  format(
    'insert into public.expenses
       (group_id, submitted_by, submitted_by_name, description, amount, splits)
     values (%L, %L, ''Bea'', ''Soap'', 30, %L::jsonb)',
    tests.recall('group'), tests.recall('bea_member'),
    json_build_object(tests.recall('alex_member'), 30)::text
  ),
  '42501',
  'a member cannot dictate the splits when submitting'
);

select lives_ok(
  format(
    'insert into public.expenses
       (group_id, submitted_by, submitted_by_name, description, amount)
     values (%L, %L, ''Bea'', ''Soap'', 30)',
    tests.recall('group'), tests.recall('bea_member')
  ),
  'a member can submit an ordinary pending expense'
);

select throws_ok(
  format(
    'insert into public.payments
       (group_id, from_id, from_name, to_id, to_name, amount, status)
     values (%L, %L, ''Bea'', %L, ''Alex'', 1000, ''confirmed'')',
    tests.recall('group'), tests.recall('bea_member'), tests.recall('alex_member')
  ),
  '42501',
  'a payer cannot record a payment as already confirmed'
);

select throws_ok(
  format(
    'insert into public.payments
       (group_id, from_id, from_name, to_id, to_name, amount)
     values (%L, %L, ''Bea'', %L, ''Cy'', 10)',
    tests.recall('group'), tests.recall('bea_member'), tests.recall('cy_member')
  ),
  'The person being paid is not in this group',
  'a payment cannot point at a member of a different group'
);

select tests.logout();
select tests.remember('expense', (
  select id::text from public.expenses where group_id = tests.recall_uuid('group')
));


-- --- 1c. Only the treasurer decides, and only through the RPCs -------------

select tests.login_as(tests.recall_uuid('bea'));

select throws_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb)',
    tests.recall('expense'),
    json_build_object(tests.recall('bea_member'), 30)::text
  ),
  'Only the treasurer can approve expenses',
  'a member cannot approve their own expense'
);

select throws_ok(
  format('select public.deny_expense(%L)', tests.recall('expense')),
  'Only the treasurer can deny expenses',
  'a member cannot deny an expense'
);

select is(
  tests.rows_affected('update public.expenses set status = ''approved'''),
  0,
  'a direct status UPDATE on expenses now matches no rows at all'
);

select tests.login_as(tests.recall_uuid('alex'));

select throws_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb)',
    tests.recall('expense'),
    json_build_object(tests.recall('bea_member'), 5)::text
  ),
  'The split has to add up to the expense total',
  'approval is refused when the splits do not sum to the total'
);

select throws_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb)',
    tests.recall('expense'),
    json_build_object(tests.recall('cy_member'), 30)::text
  ),
  'The split refers to someone who is not in this group',
  'approval is refused when a split names someone outside the group'
);

select throws_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb, ''sideways'')',
    tests.recall('expense'),
    json_build_object(tests.recall('bea_member'), 30)::text
  ),
  'Unknown split mode',
  'approval is refused when the split mode is not one we know'
);

-- Only Bea was there, so only Bea owes for it.
select lives_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb, ''subset'')',
    tests.recall('expense'),
    json_build_object(tests.recall('bea_member'), 30)::text
  ),
  'the treasurer can approve a split that leaves someone out'
);

select is(
  (select split_mode from public.expenses where id = tests.recall_uuid('expense')),
  'subset',
  'the mode the treasurer chose is recorded alongside the amounts'
);

select throws_ok(
  format(
    'select public.approve_expense(%L, %L::jsonb)',
    tests.recall('expense'),
    json_build_object(tests.recall('bea_member'), 30)::text
  ),
  'That expense has already been reviewed',
  'an expense cannot be approved a second time'
);


-- --- 1c. Confirming a payment cannot rewrite its amount --------------------

select tests.login_as(tests.recall_uuid('bea'));
insert into public.payments
  (group_id, from_id, from_name, to_id, to_name, amount)
values (
  tests.recall_uuid('group'),
  tests.recall_uuid('bea_member'), 'Bea',
  tests.recall_uuid('alex_member'), 'Alex',
  15
);

select tests.logout();
select tests.remember('payment', (
  select id::text from public.payments where group_id = tests.recall_uuid('group')
));

select tests.login_as(tests.recall_uuid('bea'));

select throws_ok(
  format('select public.confirm_payment(%L, ''confirmed'')', tests.recall('payment')),
  'Only the person who was paid can confirm this',
  'the payer cannot confirm their own payment'
);

select tests.login_as(tests.recall_uuid('alex'));

select is(
  tests.rows_affected(format(
    'update public.payments set status = ''confirmed'', amount = 9999 where id = %L',
    tests.recall('payment')
  )),
  0,
  'the recipient can no longer rewrite the amount while confirming'
);

select lives_ok(
  format('select public.confirm_payment(%L, ''confirmed'')', tests.recall('payment')),
  'the recipient can confirm the payment through the RPC'
);

select is(
  (select amount from public.payments where id = tests.recall_uuid('payment')),
  15::numeric,
  'confirming leaves the amount exactly as the payer recorded it'
);


-- --- 1d. Money columns reject nonsense amounts -----------------------------

select throws_ok(
  format(
    'insert into public.expenses
       (group_id, submitted_by, submitted_by_name, description, amount)
     values (%L, %L, ''Alex'', ''Nothing'', 0)',
    tests.recall('group'), tests.recall('alex_member')
  ),
  '23514',
  'an expense of zero is rejected by a check constraint'
);

select throws_ok(
  format(
    'insert into public.payments
       (group_id, from_id, from_name, to_id, to_name, amount)
     values (%L, %L, ''Alex'', %L, ''Bea'', -50)',
    tests.recall('group'), tests.recall('alex_member'), tests.recall('bea_member')
  ),
  '23514',
  'a negative payment is rejected by a check constraint'
);

select throws_ok(
  format(
    'insert into public.rent (group_id, amount, split_type)
     values (%L, -1, ''equal'')',
    tests.recall('group')
  ),
  '23514',
  'negative rent is rejected by a check constraint'
);


-- --- 1e / 1f. Receipts are private, invite codes are long ------------------

select tests.logout();

select is(
  (select "public" from storage.buckets where id = 'receipts'),
  false,
  'the receipts bucket is private, so receipt URLs need signing'
);

select ok(
  tests.recall('code') ~ '^[0-9A-HJKMNP-TV-Z]{10}$',
  'the invite code is ten characters of Crockford base32'
);


-- --- The treasurer role moves only through transfer_treasurer --------------

select tests.login_as(tests.recall_uuid('bea'));

select throws_ok(
  format(
    'select public.transfer_treasurer(%L, %L)',
    tests.recall('group'), tests.recall('bea_member')
  ),
  'Only the current treasurer can hand over the role',
  'a member cannot transfer the treasurer role to themselves'
);

select tests.login_as(tests.recall_uuid('alex'));

select lives_ok(
  format(
    'select public.transfer_treasurer(%L, %L)',
    tests.recall('group'), tests.recall('bea_member')
  ),
  'the treasurer can hand the role over'
);

select results_eq(
  format(
    'select is_treasurer from public.group_members
     where group_id = %L order by name',
    tests.recall('group')
  ),
  $$values (false), (true)$$,
  'handing over leaves exactly one treasurer'
);

select * from finish();
rollback;
