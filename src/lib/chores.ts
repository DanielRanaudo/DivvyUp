import type { Chore } from "@/lib/types";

export type ChoreStatus = "overdue" | "today" | "upcoming";

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
    const rotationIndex = (chore.rotationIndex + 1) % chore.rotationIds.length;
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
  const idx = (chore.rotationIndex + 1) % chore.rotationIds.length;
  return chore.rotationIds[idx];
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

/** Sorts chores by due date and buckets them for the agenda view. */
export function groupChores(chores: Chore[]): GroupedChores {
  const sorted = [...chores].sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const grouped: GroupedChores = { overdue: [], today: [], upcoming: [] };
  sorted.forEach((chore) => {
    grouped[choreStatus(chore)].push(chore);
  });
  return grouped;
}

/** Counts chores assigned to a member that are due today or overdue. */
export function myOpenChoreCount(chores: Chore[], memberId: string): number {
  return chores.filter(
    (c) => c.assigneeId === memberId && choreStatus(c) !== "upcoming"
  ).length;
}
