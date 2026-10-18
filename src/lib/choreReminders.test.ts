import { describe, expect, it } from "vitest";
import {
  buildChoreDigests,
  dateInTimeZone,
  type ChoreReminderGroup,
  type ChoreReminderMember,
} from "@/lib/choreReminders";
import type { Chore } from "@/lib/types";

const NOW = new Date("2026-10-18T13:00:00.000Z");
const SITE = "https://divvyup.site";
const ALEX = "11111111-1111-4111-8111-111111111111";
const BEA = "22222222-2222-4222-8222-222222222222";

function chore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Take out trash",
    icon: "🗑️",
    everyDays: 7,
    nextDue: "2026-10-18",
    assignMode: "fixed",
    assigneeId: ALEX,
    rotationIds: [],
    rotationIndex: 0,
    history: [],
    ...overrides,
  };
}

function group(overrides: Partial<ChoreReminderGroup> = {}): ChoreReminderGroup {
  return {
    id: "g1",
    name: "Apt 4B",
    timezone: "America/New_York",
    chores: [chore()],
    ...overrides,
  };
}

function member(
  overrides: Partial<ChoreReminderMember> = {}
): ChoreReminderMember {
  return {
    id: ALEX,
    userId: "user-alex",
    groupId: "g1",
    name: "Alex",
    email: "Alex@example.com",
    ...overrides,
  };
}

describe("dateInTimeZone", () => {
  it("uses the household date rather than the server date", () => {
    const instant = new Date("2026-10-18T01:00:00.000Z");
    expect(dateInTimeZone(instant, "America/New_York")).toBe("2026-10-17");
    expect(dateInTimeZone(instant, "Asia/Tokyo")).toBe("2026-10-18");
  });
});

describe("buildChoreDigests", () => {
  it("lists today's chores assigned to the recipient", () => {
    const [mail] = buildChoreDigests([group()], [member()], SITE, NOW);

    expect(mail).toMatchObject({
      recipientId: "user-alex",
      to: "alex@example.com",
      subject: "DivvyUp: 1 chore today",
    });
    expect(mail.text).toContain("Hi Alex,");
    expect(mail.text).toContain("Apt 4B:\n• 🗑️ Take out trash");
    expect(mail.text).toContain(SITE);
  });

  it("emails a member with no chores and says so", () => {
    const [mail] = buildChoreDigests(
      [group()],
      [member({ id: BEA, userId: "user-bea", email: "bea@example.com" })],
      SITE,
      NOW
    );

    expect(mail.subject).toBe("DivvyUp: no chores today");
    expect(mail.text).toContain("You have no chores to do today.");
    expect(mail.text).not.toContain("Take out trash");
  });

  it("omits chores due on another day or assigned to someone else", () => {
    const [mail] = buildChoreDigests(
      [
        group({
          chores: [
            chore({ nextDue: "2026-10-19" }),
            chore({
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              name: "Mop",
              assigneeId: BEA,
            }),
          ],
        }),
      ],
      [member()],
      SITE,
      NOW
    );

    expect(mail.subject).toBe("DivvyUp: no chores today");
  });

  it("omits a completed one-off chore", () => {
    const done = chore({
      everyDays: 0,
      history: [
        {
          date: "2026-10-18",
          assigneeId: ALEX,
          completedAt: "2026-10-18T11:00:00.000Z",
        },
      ],
    });
    const [mail] = buildChoreDigests(
      [group({ chores: [done] })],
      [member()],
      SITE,
      NOW
    );

    expect(mail.subject).toBe("DivvyUp: no chores today");
  });

  it("combines a person's households into one email", () => {
    const secondGroup = group({
      id: "g2",
      name: "Beach House",
      chores: [chore({ name: "Bring in bins", icon: "" })],
    });
    const [mail] = buildChoreDigests(
      [group(), secondGroup],
      [member(), member({ id: ALEX, groupId: "g2" })],
      SITE,
      NOW
    );

    expect(mail.subject).toBe("DivvyUp: 2 chores today");
    expect(mail.text).toContain("Apt 4B:");
    expect(mail.text).toContain("Beach House:\n• Bring in bins");
  });

  it("skips members whose profile has no email", () => {
    expect(
      buildChoreDigests([group()], [member({ email: null })], SITE, NOW)
    ).toEqual([]);
  });
});
