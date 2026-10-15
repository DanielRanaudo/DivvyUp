# Chore rollover and accountability plan

## Problem

Recurring chores currently advance only when the assigned roommate presses
**Done**. If nobody records the occurrence, the saved due date and assignee stay
stuck even though the calendar projects later occurrences as if the rotation had
advanced. One forgotten tap can therefore make the live board disagree with the
schedule.

## Product rules

1. The schedule advances independently from completion reporting.
2. An occurrence remains available until the next scheduled occurrence starts.
   At that boundary, an unrecorded occurrence becomes **Not confirmed** and the
   next occurrence begins.
3. A roommate can report their own unconfirmed occurrence later. This changes
   only that history entry; it never rewinds the current schedule.
4. The treasurer can excuse an unconfirmed occurrence. Other schedule and
   history corrections remain treasurer-only.
5. One-time chores never roll over automatically. They remain open until they
   are completed, edited, or deleted.
6. Recent history is visible to the household. The wording describes what the
   app knows ("Not confirmed"), rather than claiming that a person did not do
   the physical task.
7. Existing history entries have no outcome field and continue to mean
   **Completed**.

## State transitions

- **Completed:** the current assignee records Done before the next occurrence.
  The existing completion timestamp is preserved and the schedule advances once.
- **Not confirmed:** the next occurrence starts without a completion. The server
  records the scheduled date and assignee, then advances once.
- **Reported later:** the original assignee reports an earlier Not confirmed
  entry. The current due date and assignee do not change.
- **Excused:** the treasurer clears a Not confirmed entry without treating it as
  a completion. The current schedule does not change.

If several occurrences elapsed while the app was inactive, every elapsed slot is
recorded and the schedule advances the same number of times. Repeating the
rollover operation is idempotent.

## Source of truth and timing

Supabase owns rollover. A database function locks each group row, calculates the
household's current date in its stored IANA timezone, appends any missing history
entries, advances the rotation, and increments `docs_version` once when anything
changed.

Rollover runs in two places:

- immediately before groups are loaded, so opening the app always self-heals;
- from a daily authenticated Vercel cron route, so inactive households and
  external consumers do not remain stale indefinitely.

New groups save the creator's browser timezone. Existing groups receive the
project's current household default and can be updated safely by the treasurer
in a later settings enhancement.

## Authorization

- Any household member may invoke rollover because the server chooses the date
  and permits only deterministic forward movement.
- Only the currently assigned member may complete the current occurrence.
- Only the original assignee may change their Not confirmed entry to Reported
  later.
- Only the treasurer may excuse an occurrence, edit a schedule, or rewrite any
  other history.
- All mutations use row locks and the existing document version counter so a
  completion, rollover, and schedule edit cannot silently overwrite each other.

## UI

The Chores tab gets a compact **Recent history** section visible to all group
members. It combines history from every chore, newest first, and uses neutral
labels:

- Completed
- Not confirmed
- Reported later
- Excused

The original assignee sees **I did this** on a Not confirmed row. The treasurer
sees **Excuse**. Both actions require server validation even if a modified client
tries to bypass the interface.

## Compatibility and calendar boundary

The existing `Chore` JSON shape remains intact. History receives optional
outcome and audit timestamps, so old clients and old entries remain readable.
Calendar projection remains outside this change; the parallel calendar work can
continue consuming `nextDue`, `assigneeId`, `rotationIds`, and `history`.

## Verification matrix

- waits until the next occurrence boundary before rolling;
- catches up one or many fixed and rotating occurrences;
- wraps rotations and repairs stale rotation indexes;
- leaves one-time chores untouched;
- is idempotent;
- records the correct scheduled assignee for every elapsed occurrence;
- allows only the original assignee to report later;
- allows only the treasurer to excuse or rewrite history;
- serializes completion and rollover without double advancement;
- advances `docs_version` and realtime state exactly once per changed group;
- renders history and actions correctly in the browser;
- preserves existing completion records and calendar-facing fields.
