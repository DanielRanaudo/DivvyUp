import type { Chore } from "@/lib/types";

export type ChoreStatus = "overdue" | "today" | "upcoming";

/** A one-off chore is closed once its only scheduled occurrence is logged. */
export function isChoreComplete(chore: Chore): boolean {
  return (
    chore.everyDays <= 0 &&
    chore.history.some((completion) => completion.date === chore.nextDue)
  );
}

/** Returns today's date as a yyyy-mm-dd string in the user's local timezone. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Adds `n` days to a yyyy-mm-dd date string and returns a yyyy-mm-dd string.
 * Uses UTC math on the date parts to avoid daylight-saving drift.
 */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Marks the current occurrence of a chore as done: logs the completion and,
 * for recurring chores, advances the due date (and the rotation assignee).
 */
export function completeChore(chore: Chore): Chore {
  // A one-off has no next occurrence. Keeping this operation idempotent avoids
  // duplicate history if two clicks land before React has re-rendered.
  if (isChoreComplete(chore)) return chore;

  const completion = {
    date: chore.nextDue,
    assigneeId: chore.assigneeId,
    completedAt: new Date().toISOString(),
  };
  const history = [...chore.history, completion];

  if (chore.everyDays <= 0) {
    return { ...chore, history };
  }

  const nextDue = addDaysISO(chore.nextDue, chore.everyDays);

  if (chore.assignMode === "rotation" && chore.rotationIds.length > 0) {
    const rotationIndex =
      (currentRotationIndex(chore) + 1) % chore.rotationIds.length;
    return {
      ...chore,
      history,
      nextDue,
      rotationIndex,
      assigneeId: chore.rotationIds[rotationIndex],
    };
  }

  return { ...chore, history, nextDue };
}

/** Returns the assignee id of the occurrence after the current one. */
export function nextAssigneeId(chore: Chore): string {
  if (chore.assignMode !== "rotation" || chore.rotationIds.length === 0) {
    return chore.assigneeId;
  }
  const idx = (currentRotationIndex(chore) + 1) % chore.rotationIds.length;
  return chore.rotationIds[idx];
}

/**
 * Uses the assignee as the source of truth when possible. Older saved chores
 * can have a stale index after a roommate leaves, and trusting that index would
 * skip a turn or assign the same person twice.
 */
function currentRotationIndex(chore: Chore): number {
  const assignedIndex = chore.rotationIds.indexOf(chore.assigneeId);
  if (assignedIndex >= 0) return assignedIndex;

  const length = chore.rotationIds.length;
  return ((Math.trunc(chore.rotationIndex) % length) + length) % length;
}

export function choreStatus(chore: Chore): ChoreStatus {
  const today = todayISO();
  if (chore.nextDue < today) return "overdue";
  if (chore.nextDue === today) return "today";
  return "upcoming";
}

export interface GroupedChores {
  overdue: Chore[];
  today: Chore[];
  upcoming: Chore[];
}

/** Sorts open chores by due date and buckets them for the agenda view. */
export function groupChores(chores: Chore[]): GroupedChores {
  const sorted = chores
    .filter((chore) => !isChoreComplete(chore))
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const grouped: GroupedChores = { overdue: [], today: [], upcoming: [] };
  sorted.forEach((chore) => {
    grouped[choreStatus(chore)].push(chore);
  });
  return grouped;
}

/** Counts chores assigned to a member that are due today or overdue. */
export function myOpenChoreCount(chores: Chore[], memberId: string): number {
  return chores.filter(
    (c) =>
      !isChoreComplete(c) &&
      c.assigneeId === memberId &&
      choreStatus(c) !== "upcoming"
  ).length;
}

/** A single projected instance of a chore falling on a specific date. */
export interface ChoreOccurrence {
  choreId: string;
  name: string;
  icon: string;
  date: string;
  assigneeId: string;
  everyDays: number;
}

// Upper bound on projected instances per chore, so a daily chore over a long
// window can't spin the loop indefinitely.
const MAX_PROJECTED = 400;

/**
 * Projects future occurrences of the given chores that fall within
 * [fromISO, toISO] (inclusive), assuming each occurrence is completed on its
 * due date. Recurring chores advance by `everyDays` and rotation assignees
 * cycle exactly as they would in {@link completeChore}. One-off chores
 * (everyDays <= 0) yield at most their single `nextDue` occurrence.
 *
 * Results are sorted by date, then by chore name for stable ordering.
 */
export function projectOccurrences(
  chores: Chore[],
  fromISO: string,
  toISO: string
): ChoreOccurrence[] {
  const out: ChoreOccurrence[] = [];

  if (fromISO > toISO) return out;

  for (const chore of chores) {
    if (isChoreComplete(chore)) continue;

    let date = chore.nextDue;
    let rotationIndex =
      chore.assignMode === "rotation" && chore.rotationIds.length > 0
        ? currentRotationIndex(chore)
        : chore.rotationIndex;
    let assigneeId = chore.assigneeId;

    const push = () => {
      if (date >= fromISO && date <= toISO) {
        out.push({
          choreId: chore.id,
          name: chore.name,
          icon: chore.icon,
          date,
          assigneeId,
          everyDays: chore.everyDays,
        });
      }
    };

    if (chore.everyDays <= 0) {
      push();
      continue;
    }

    // Jump directly to the first occurrence in the requested window. Without
    // this, a daily chore that began more than MAX_PROJECTED days ago would hit
    // the safety cap before it ever reached the dates the caller asked for.
    const daysToWindow = daysBetweenISO(date, fromISO);
    if (daysToWindow > 0) {
      const skipped = Math.ceil(daysToWindow / chore.everyDays);
      date = addDaysISO(date, skipped * chore.everyDays);
      if (chore.assignMode === "rotation" && chore.rotationIds.length > 0) {
        rotationIndex =
          (rotationIndex + skipped) % chore.rotationIds.length;
        assigneeId = chore.rotationIds[rotationIndex];
      }
    }

    for (let i = 0; i < MAX_PROJECTED && date <= toISO; i++) {
      push();
      date = addDaysISO(date, chore.everyDays);
      if (chore.assignMode === "rotation" && chore.rotationIds.length > 0) {
        rotationIndex = (rotationIndex + 1) % chore.rotationIds.length;
        assigneeId = chore.rotationIds[rotationIndex];
      }
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return out;
}

function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fromY, fromM, fromD] = fromISO.split("-").map(Number);
  const [toY, toM, toD] = toISO.split("-").map(Number);
  return Math.round(
    (Date.UTC(toY, toM - 1, toD) - Date.UTC(fromY, fromM - 1, fromD)) /
      86_400_000
  );
}
