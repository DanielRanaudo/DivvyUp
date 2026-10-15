import { describe, expect, it } from "vitest";
import {
  buildCalendarFeed,
  escapeICalText,
  foldICalLine,
  type CalendarFeedGroup,
} from "@/lib/calendarFeed";
import type { Chore } from "@/lib/types";

const ALEX = "11111111-1111-4111-8111-111111111111";
const BEA = "22222222-2222-4222-8222-222222222222";

function chore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Take out trash",
    icon: "🗑️",
    everyDays: 7,
    nextDue: "2026-10-15",
    assignMode: "fixed",
    assigneeId: ALEX,
    rotationIds: [],
    rotationIndex: 0,
    history: [],
    ...overrides,
  };
}

function group(overrides: Partial<CalendarFeedGroup> = {}): CalendarFeedGroup {
  return {
    groupId: "99999999-9999-4999-8999-999999999999",
    groupName: "Apt 4B",
    memberId: ALEX,
    chores: [chore()],
    docsVersion: 7,
    updatedAt: "2026-10-15T14:30:45.123Z",
    ...overrides,
  };
}

const options = { today: "2026-10-15", siteUrl: "https://divvyup.site" };

describe("buildCalendarFeed", () => {
  it("includes only occurrences assigned to the feed owner", () => {
    const feed = buildCalendarFeed(
      [
        group({
          chores: [
            chore(),
            chore({
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              name: "Clean Bea's room",
              assigneeId: BEA,
            }),
          ],
        }),
      ],
      options
    );

    expect(feed).toContain("SUMMARY:🗑️ Take out trash — Apt 4B");
    expect(feed).not.toContain("Clean Bea's room");
  });

  it("projects rotation turns and keeps only this roommate's dates", () => {
    const feed = buildCalendarFeed(
      [
        group({
          chores: [
            chore({
              everyDays: 2,
              assignMode: "rotation",
              rotationIds: [ALEX, BEA],
              assigneeId: ALEX,
              rotationIndex: 0,
            }),
          ],
        }),
      ],
      options
    );

    expect(feed).toContain("DTSTART;VALUE=DATE:20261015");
    expect(feed).toContain("DTSTART;VALUE=DATE:20261019");
    expect(feed).not.toContain("DTSTART;VALUE=DATE:20261017");
  });

  it("includes the current overdue assignment alongside future projections", () => {
    const feed = buildCalendarFeed(
      [group({ chores: [chore({ nextDue: "2026-10-10" })] })],
      options
    );

    expect(feed).toContain("DTSTART;VALUE=DATE:20261010");
    expect(feed).toContain("DTEND;VALUE=DATE:20261011");
  });

  it("omits a completed one-off chore", () => {
    const done = chore({
      everyDays: 0,
      history: [
        {
          date: "2026-10-15",
          assigneeId: ALEX,
          completedAt: "2026-10-15T12:00:00.000Z",
        },
      ],
    });

    expect(buildCalendarFeed([group({ chores: [done] })], options)).not.toContain(
      "BEGIN:VEVENT"
    );
  });

  it("uses stable identifiers and versions events from the chore document", () => {
    const feed = buildCalendarFeed([group()], options);

    expect(feed).toContain(
      "UID:99999999-9999-4999-8999-999999999999-aaaaaaaa-aaaa-4aaa-8aaa-a"
    );
    expect(feed).toContain("SEQUENCE:7");
    expect(feed).toContain("LAST-MODIFIED:20261015T143045Z");
    expect(feed).toContain(
      "URL:https://divvyup.site/?screen=app&g=99999999-9999-4999-8999-999999"
    );
  });

  it("returns a valid empty calendar when the user has no groups", () => {
    expect(buildCalendarFeed([], options)).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DivvyUp//Chore Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:DivvyUp Chores",
        "X-WR-CALDESC:Chores assigned to you in DivvyUp",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
        "END:VCALENDAR",
        "",
      ].join("\r\n")
    );
  });
});

describe("iCalendar encoding", () => {
  it("escapes reserved text characters and line breaks", () => {
    expect(escapeICalText("Kitchen, bath; then\\done\nnext")).toBe(
      "Kitchen\\, bath\\; then\\\\done\\nnext"
    );
  });

  it("folds long Unicode content lines to at most 75 UTF-8 octets", () => {
    const folded = foldICalLine(`SUMMARY:${"🗑️ café ".repeat(20)}`);
    const encoder = new TextEncoder();

    expect(folded).toContain("\r\n ");
    folded.split("\r\n").forEach((line) => {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    });
  });
});

