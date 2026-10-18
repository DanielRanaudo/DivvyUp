import { isChoreComplete } from "@/lib/chores";
import type { Chore } from "@/lib/types";

export interface ChoreReminderGroup {
  id: string;
  name: string;
  timezone: string;
  chores: Chore[];
}

export interface ChoreReminderMember {
  id: string;
  userId: string;
  groupId: string;
  name: string;
  email: string | null;
}

export interface ChoreDigest {
  /** Stable account id used to make Resend retries idempotent. */
  recipientId: string;
  to: string;
  subject: string;
  text: string;
}

interface HouseholdChores {
  groupName: string;
  chores: Chore[];
}

interface RecipientDigest {
  recipientId: string;
  email: string;
  name: string;
  households: HouseholdChores[];
}

/** Returns yyyy-mm-dd for an instant in an IANA timezone. */
export function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function choresFor(
  group: ChoreReminderGroup,
  memberId: string,
  today: string
): Chore[] {
  return (Array.isArray(group.chores) ? group.chores : [])
    .filter(
      (chore) =>
        chore.assigneeId === memberId &&
        chore.nextDue === today &&
        !isChoreComplete(chore)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

function choreLine(chore: Chore): string {
  const icon = chore.icon.trim();
  return `• ${icon === "" ? "" : `${icon} `}${chore.name}`;
}

function bodyFor(recipient: RecipientDigest, siteUrl: string): string {
  const total = recipient.households.reduce(
    (sum, household) => sum + household.chores.length,
    0
  );
  const greeting = `Hi ${recipient.name || "there"},`;

  if (total === 0) {
    return [
      greeting,
      "",
      "You have no chores to do today.",
      "",
      `Open DivvyUp: ${siteUrl}`,
    ].join("\n");
  }

  const chores = recipient.households
    .filter((household) => household.chores.length > 0)
    .map(({ groupName, chores: householdChores }) =>
      [groupName + ":", ...householdChores.map(choreLine)].join("\n")
    )
    .join("\n\n");

  return [
    greeting,
    "",
    `You have ${total} chore${total === 1 ? "" : "s"} to do today:`,
    "",
    chores,
    "",
    `Open DivvyUp: ${siteUrl}`,
  ].join("\n");
}

/** Builds one morning chore email per account, including accounts with no chores. */
export function buildChoreDigests(
  groups: ChoreReminderGroup[],
  members: ChoreReminderMember[],
  siteUrl: string,
  now: Date = new Date()
): ChoreDigest[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const dateByGroupId = new Map(
    groups.map((group) => [group.id, dateInTimeZone(now, group.timezone)])
  );
  const recipientById = new Map<string, RecipientDigest>();

  for (const member of members) {
    const email = member.email?.trim();
    const group = groupById.get(member.groupId);
    const today = dateByGroupId.get(member.groupId);
    if (!email || !group || !today) continue;

    const recipient = recipientById.get(member.userId) ?? {
      recipientId: member.userId,
      email: email.toLowerCase(),
      name: member.name,
      households: [],
    };
    recipient.households.push({
      groupName: group.name || "Your house",
      chores: choresFor(group, member.id, today),
    });
    recipientById.set(member.userId, recipient);
  }

  return [...recipientById.values()]
    .map((recipient) => {
      recipient.households.sort((a, b) =>
        a.groupName.localeCompare(b.groupName)
      );
      const total = recipient.households.reduce(
        (sum, household) => sum + household.chores.length,
        0
      );
      return {
        recipientId: recipient.recipientId,
        to: recipient.email,
        subject:
          total === 0
            ? "DivvyUp: no chores today"
            : `DivvyUp: ${total} chore${total === 1 ? "" : "s"} today`,
        text: bodyFor(recipient, siteUrl),
      };
    })
    .sort((a, b) => a.to.localeCompare(b.to));
}
