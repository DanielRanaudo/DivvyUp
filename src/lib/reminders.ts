import { formatMoney } from "./format";

export interface Recipient {
  email: string;
  name: string;
}

export interface ReminderTask {
  /** What the recipient has to do: approve an expense, or answer a payment. */
  kind: "approval" | "payment";
  recipient: Recipient;
  groupName: string;
  /** Who is waiting on them. */
  who: string;
  /** The expense description; empty for payments. */
  what: string;
  amount: number;
  /** When the thing started waiting. */
  since: string;
}

export interface Reminder {
  to: string;
  subject: string;
  text: string;
}

/**
 * A day's grace before the first nudge.
 *
 * A treasurer who is going to approve an expense usually does it within an
 * evening, and an email that arrives before they've had the chance is the kind
 * of thing people build filters for.
 */
export const GRACE_HOURS = 24;

function hoursSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (now.getTime() - then) / 3_600_000;
}

function waitedFor(iso: string, now: Date): string {
  const days = Math.floor(hoursSince(iso, now) / 24);
  if (days < 1) return "since yesterday";
  return days === 1 ? "for a day" : `for ${days} days`;
}

function line(task: ReminderTask, now: Date): string {
  const waited = waitedFor(task.since, now);
  const amount = formatMoney(task.amount);
  return task.kind === "approval"
    ? `• ${task.who} submitted ${task.what} for ${amount} — waiting ${waited}.`
    : `• ${task.who} says they paid you ${amount} — waiting ${waited}.`;
}

function subjectFor(tasks: ReminderTask[]): string {
  const approvals = tasks.filter((t) => t.kind === "approval").length;
  const payments = tasks.length - approvals;
  const parts = [
    approvals > 0 &&
      `${approvals} expense${approvals === 1 ? "" : "s"} to approve`,
    payments > 0 &&
      `${payments} payment${payments === 1 ? "" : "s"} to confirm`,
  ].filter((p): p is string => typeof p === "string");
  return `DivvyUp: ${parts.join(" and ")}`;
}

export interface GroupRow {
  id: string;
  name: string;
}

export interface MemberRow {
  id: string;
  group_id: string;
  name: string;
  is_treasurer: boolean;
  /** From the member's profile; missing for accounts created without one. */
  email: string | null;
}

export interface PendingExpenseRow {
  group_id: string;
  description: string;
  amount: number;
  date: string;
  submitted_by_name: string;
}

export interface PendingPaymentRow {
  group_id: string;
  to_id: string | null;
  from_name: string;
  amount: number;
  date: string;
}

/**
 * Works out who each waiting thing is waiting on: expenses wait on the
 * treasurer, payments wait on the person who was supposedly paid.
 */
export function tasksFrom(
  groups: GroupRow[],
  members: MemberRow[],
  expenses: PendingExpenseRow[],
  payments: PendingPaymentRow[]
): ReminderTask[] {
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const byId = new Map(members.map((m) => [m.id, m]));
  const recipientOf = (m: MemberRow): Recipient => ({
    email: m.email ?? "",
    name: m.name,
  });

  const tasks: ReminderTask[] = [];

  for (const e of expenses) {
    const treasurers = members.filter(
      (m) => m.group_id === e.group_id && m.is_treasurer
    );
    for (const t of treasurers) {
      tasks.push({
        kind: "approval",
        recipient: recipientOf(t),
        groupName: groupName.get(e.group_id) ?? "Your house",
        who: e.submitted_by_name,
        what: e.description,
        amount: Number(e.amount),
        since: e.date,
      });
    }
  }

  for (const p of payments) {
    const payee = p.to_id ? byId.get(p.to_id) : undefined;
    if (!payee) continue;
    tasks.push({
      kind: "payment",
      recipient: recipientOf(payee),
      groupName: groupName.get(p.group_id) ?? "Your house",
      who: p.from_name,
      what: "",
      amount: Number(p.amount),
      since: p.date,
    });
  }

  return tasks;
}

/**
 * Turns everything that is waiting into one email per person.
 *
 * One email, not one per item: a roommate who has been away for a week should
 * come back to a single list, not eleven separate nudges.
 */
export function buildReminders(
  tasks: ReminderTask[],
  siteUrl: string,
  now: Date = new Date()
): Reminder[] {
  const ripe = tasks
    .filter((t) => t.recipient.email !== "")
    .filter((t) => hoursSince(t.since, now) >= GRACE_HOURS)
    .sort((a, b) => a.since.localeCompare(b.since));

  const byEmail = new Map<string, ReminderTask[]>();
  for (const task of ripe) {
    const key = task.recipient.email.toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), task]);
  }

  return [...byEmail.entries()].map(([email, theirs]) => {
    const byGroup = new Map<string, ReminderTask[]>();
    for (const task of theirs) {
      byGroup.set(task.groupName, [
        ...(byGroup.get(task.groupName) ?? []),
        task,
      ]);
    }

    const body = [...byGroup.entries()]
      .map(([groupName, group]) =>
        [`${groupName}:`, ...group.map((t) => line(t, now))].join("\n")
      )
      .join("\n\n");

    return {
      to: email,
      subject: subjectFor(theirs),
      text: [
        `Hi ${theirs[0].recipient.name || "there"},`,
        "",
        "A few things in DivvyUp are waiting on you:",
        "",
        body,
        "",
        `Open DivvyUp: ${siteUrl}`,
        "",
        "You're getting this because you're in a DivvyUp house. It only sends",
        "when something has been waiting more than a day.",
      ].join("\n"),
    };
  });
}
