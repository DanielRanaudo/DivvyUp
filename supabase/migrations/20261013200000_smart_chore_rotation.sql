-- Smart rotations follow the household roster. A membership insert appends
-- the new member to each opted-in rotation and advances docs_version so a
-- client editing an older copy cannot silently overwrite the enrollment.

create or replace function public.add_member_to_smart_chore_rotations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups as household
  set chores = (
        select coalesce(
          jsonb_agg(
            case
              when chore ->> 'assignMode' = 'rotation'
               and chore ->> 'smartRotation' = 'true'
               and not (
                 coalesce(chore -> 'rotationIds', '[]'::jsonb)
                 @> jsonb_build_array(new.id::text)
               )
              then jsonb_set(
                chore,
                '{rotationIds}',
                coalesce(chore -> 'rotationIds', '[]'::jsonb)
                  || jsonb_build_array(new.id::text),
                true
              )
              else chore
            end
            order by position
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(coalesce(household.chores, '[]'::jsonb))
             with ordinality as chores(chore, position)
      ),
      docs_version = household.docs_version + 1
  where household.id = new.group_id
    and exists (
      select 1
      from jsonb_array_elements(coalesce(household.chores, '[]'::jsonb)) chore
      where chore ->> 'assignMode' = 'rotation'
        and chore ->> 'smartRotation' = 'true'
        and not (
          coalesce(chore -> 'rotationIds', '[]'::jsonb)
          @> jsonb_build_array(new.id::text)
        )
    );

  return new;
end;
$$;

drop trigger if exists add_member_to_smart_chore_rotations_trg
  on public.group_members;
create trigger add_member_to_smart_chore_rotations_trg
  after insert on public.group_members
  for each row execute function public.add_member_to_smart_chore_rotations();
