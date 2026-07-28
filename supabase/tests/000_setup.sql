-- ============================================================================
-- Shared fixtures for the pgTAP suites in this folder
-- ============================================================================
-- Runs first (files execute in name order) and commits, so the suites that
-- follow can impersonate users without repeating the plumbing. Everything lives
-- in a `tests` schema that only exists on a local `supabase start` database.
--
--   npm run db:test
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated;

-- Impersonates a signed-in user for the rest of the transaction, the way
-- PostgREST does: auth.uid() reads the `sub` claim out of request.jwt.claims.
create or replace function tests.login_as(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set role authenticated';
end;
$$;

-- Drops back to the owning role, for setup that RLS would otherwise block.
create or replace function tests.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;

-- Creates an auth user; the on_auth_user_created trigger fills in the profile.
create or replace function tests.create_user(p_email text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (new_id, p_email, jsonb_build_object('name', p_name));
  return new_id;
end;
$$;

-- Runs a statement as the current role and reports how many rows it touched.
-- An UPDATE against a table with no matching policy is not an error, it is a
-- silent no-op, so several tests below assert on the count rather than a throw.
create or replace function tests.rows_affected(p_sql text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Scratch space for ids, since each suite needs to hand values between
-- statements run as different users. Rows disappear with each suite's rollback.
create table if not exists tests.ctx (
  slot text primary key,
  val  text
);
grant select, insert, update, delete on tests.ctx to authenticated;

create or replace function tests.remember(p_slot text, p_val text)
returns text
language sql
as $$
  insert into tests.ctx (slot, val) values (p_slot, p_val)
  on conflict (slot) do update set val = excluded.val
  returning val;
$$;

create or replace function tests.recall(p_slot text)
returns text
language sql
stable
as $$
  select val from tests.ctx where slot = p_slot;
$$;

create or replace function tests.recall_uuid(p_slot text)
returns uuid
language sql
stable
as $$
  select val::uuid from tests.ctx where slot = p_slot;
$$;

grant execute on all functions in schema tests to authenticated;

select plan(6);

select has_function('tests', 'login_as', 'login_as is available to the suites');
select has_function('tests', 'create_user', 'create_user is available');
select has_function('tests', 'rows_affected', 'rows_affected is available');
select has_function('tests', 'remember', 'remember is available');
select has_table('tests', 'ctx', 'the scratch table exists');
select has_extension('extensions', 'pgtap', 'pgTAP itself is installed');

select * from finish();

commit;
