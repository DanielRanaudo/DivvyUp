import { addDaysISO, isChoreComplete, projectOccurrences } from "@/lib/chores";
import type { ChoreOccurrence } from "@/lib/chores";
import type { Chore } from "@/lib/types";

export const CALENDAR_FEED_FUTURE_DAYS = 90;

export interface CalendarFeedGroup {
  groupId: string;
  groupName: string;
  memberId: string;
  chores: Chore[];
  docsVersion: number;
  updatedAt: string;
}

interface CalendarFeedOptions {
  /** yyyy-mm-dd, injectable so tests and callers agree on the local date. */
  today: string;
  siteUrl: string;
}

interface FeedOccurrence extends ChoreOccurrence {
  groupId: string;
  groupName: string;
  memberId: string;
  docsVersion: number;
  updatedAt: string;
}

/**
 * Builds a read-only iCalendar subscription containing only chores assigned to
 * the token owner in each household. Future rotation turns use the exact same
 * projection as DivvyUp's in-app calendar. The currently overdue turn is added
 * separately because a projection beginning today would otherwise hide it.
 */
export function buildCalendarFeed(
  groups: CalendarFeedGroup[],
  { today, siteUrl }: CalendarFeedOptions
): string {
  const through = addDaysISO(today, CALENDAR_FEED_FUTURE_DAYS);
  const occurrences = groups.flatMap((group) =>
    occurrencesForMember(group, today, through)
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DivvyUp//Chore Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:DivvyUp Chores",
    "X-WR-CALDESC:Chores assigned to you in DivvyUp",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...occurrences.flatMap((occurrence) => eventLines(occurrence, siteUrl)),
    "END:VCALENDAR",
  ];

  return `${lines.map(foldICalLine).join("\r\n")}\r\n`;
}

function occurrencesForMember(
  group: CalendarFeedGroup,
  today: string,
  through: string
): FeedOccurrence[] {
  const projected = projectOccurrences(group.chores, today, through)
    .filter((occurrence) => occurrence.assigneeId === group.memberId)
    .map((occurrence) => withGroup(occurrence, group));

  const overdue = group.chores
    .filter(
      (chore) =>
        !isChoreComplete(chore) &&
        chore.nextDue < today &&
        chore.assigneeId === group.memberId
    )
    .map((chore) =>
      withGroup(
        {
          choreId: chore.id,
          name: chore.name,
          icon: chore.icon,
          date: chore.nextDue,
          assigneeId: chore.assigneeId,
          everyDays: chore.everyDays,
        },
        group
      )
    );

  return [...overdue, ...projected].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.groupName.localeCompare(b.groupName) ||
      a.name.localeCompare(b.name)
  );
}

function withGroup(
  occurrence: ChoreOccurrence,
  group: CalendarFeedGroup
): FeedOccurrence {
  return {
    ...occurrence,
    groupId: group.groupId,
    groupName: group.groupName,
    memberId: group.memberId,
    docsVersion: group.docsVersion,
    updatedAt: group.updatedAt,
  };
}

function eventLines(occurrence: FeedOccurrence, siteUrl: string): string[] {
  const appUrl = new URL("/", siteUrl);
  appUrl.searchParams.set("screen", "app");
  appUrl.searchParams.set("g", occurrence.groupId);
  appUrl.searchParams.set("tab", "chores");

  const uid = [
    occurrence.groupId,
    occurrence.choreId,
    occurrence.date,
    occurrence.memberId,
  ].join("-");
  const changedAt = calendarTimestamp(occurrence.updatedAt);
  const summary = `${occurrence.icon} ${occurrence.name} — ${occurrence.groupName}`;
  const description = `Assigned to you in ${occurrence.groupName}. Manage this chore in DivvyUp.`;

  return [
    "BEGIN:VEVENT",
    `UID:${escapeICalText(uid)}@divvyup.site`,
    `DTSTAMP:${changedAt}`,
    `LAST-MODIFIED:${changedAt}`,
    `SEQUENCE:${Math.max(0, Math.trunc(occurrence.docsVersion))}`,
    `DTSTART;VALUE=DATE:${calendarDate(occurrence.date)}`,
    `DTEND;VALUE=DATE:${calendarDate(addDaysISO(occurrence.date, 1))}`,
    `SUMMARY:${escapeICalText(summary)}`,
    `DESCRIPTION:${escapeICalText(description)}`,
    `URL:${escapeICalText(appUrl.toString())}`,
    "CATEGORIES:DivvyUp,Chores",
    "CLASS:PRIVATE",
    "TRANSP:TRANSPARENT",
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ];
}

/** RFC 5545 TEXT escaping. */
export function escapeICalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * RFC 5545 content lines are limited to 75 UTF-8 octets. Continuation lines
 * start with one space, which counts toward their own limit.
 */
export function foldICalLine(value: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let octets = 0;

  for (const character of value) {
    const size = encoder.encode(character).length;
    if (octets + size > 75 && current !== "") {
      lines.push(current);
      current = ` ${character}`;
      octets = 1 + size;
    } else {
      current += character;
      octets += size;
    }
  }

  lines.push(current);
  return lines.join("\r\n");
}

function calendarDate(iso: string): string {
  return iso.replaceAll("-", "");
}

function calendarTimestamp(value: string): string {
  const parsed = new Date(value);
  const safe = Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  return safe.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

