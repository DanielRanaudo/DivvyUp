-- A roommate can expose only their own assigned chores through a private
-- iCalendar subscription URL. The URL contains a 256-bit bearer token; only
-- its SHA-256 hash is stored, so a database read does not reveal usable feed
-- links. Google Calendar fetches the feed without a DivvyUp login, which is why
-- the token lookup happens in one deliberately narrow SECURITY DEFINER RPC.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.calendar_feed_tokens (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  token_hash  text not null unique
                check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  rotated_at  timestamptz not null default now()
);

alter table public.calendar_feed_tokens enable row level security;

grant select, delete on public.calendar_feed_tokens to authenticated;

drop policy if exists calendar_feed_tokens_select on public.calendar_feed_tokens;
create policy calendar_feed_tokens_select on public.calendar_feed_tokens
  for select using (user_id = auth.uid());

drop policy if exists calendar_feed_tokens_delete on public.calendar_feed_tokens;
create policy calendar_feed_tokens_delete on public.calendar_feed_tokens
  for delete using (user_id = auth.uid());

-- Returns the raw token exactly once. A later status read deliberately exposes
-- only whether a feed exists; rotating is the recovery path for a lost link.
create or replace function public.rotate_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.calendar_feed_tokens (user_id, token_hash)
  values (
    auth.uid(),
    encode(extensions.digest(raw_token, 'sha256'), 'hex')
  )
  on conflict (user_id) do update
  set token_hash = excluded.token_hash,
      rotated_at = now();

  return raw_token;
end;
$$;

revoke all on function public.rotate_calendar_feed_token() from public, anon;
grant execute on function public.rotate_calendar_feed_token() to authenticated;

-- Returns null for an invalid/disabled token and {"groups": []} for a valid
-- token whose owner is not currently in a group. The latter distinction lets
-- the HTTP endpoint serve an empty but valid calendar instead of leaking
-- whether the account has household memberships.
create or replace function public.read_calendar_feed(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
declare
  owner_id uuid;
  groups_json jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select feed.user_id into owner_id
  from public.calendar_feed_tokens as feed
  where feed.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if owner_id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'groupId', household.id,
        'groupName', household.name,
        'memberId', membership.id,
        -- The anonymous RPC never returns chores this roommate cannot be
        -- assigned. Rotation members need the whole matching chore document so
        -- the application can project their future turns accurately. History
        -- is not needed by the feed and is stripped; completed one-offs are
        -- excluded here before that history is removed.
        'chores', (
          select coalesce(
            jsonb_agg(
              jsonb_set(item.chore, '{history}', '[]'::jsonb, true)
              order by item.position
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(coalesce(household.chores, '[]'::jsonb))
               with ordinality as item(chore, position)
          where (
              item.chore ->> 'assigneeId' = membership.id::text
              or coalesce(item.chore -> 'rotationIds', '[]'::jsonb)
                 @> jsonb_build_array(membership.id::text)
            )
            and not (
              (item.chore ->> 'everyDays')::integer <= 0
              and exists (
                select 1
                from jsonb_array_elements(
                  coalesce(item.chore -> 'history', '[]'::jsonb)
                ) as history(entry)
                where history.entry ->> 'date' = item.chore ->> 'nextDue'
                  and coalesce(history.entry ->> 'outcome', 'completed')
                      <> 'not_confirmed'
              )
            )
        ),
        'docsVersion', household.docs_version,
        'updatedAt', household.updated_at
      )
      order by household.created_at
    ),
    '[]'::jsonb
  ) into groups_json
  from public.group_members as membership
  join public.groups as household on household.id = membership.group_id
  where membership.user_id = owner_id;

  return jsonb_build_object('groups', groups_json);
end;
$$;

revoke all on function public.read_calendar_feed(text) from public;
grant execute on function public.read_calendar_feed(text) to anon, authenticated;

