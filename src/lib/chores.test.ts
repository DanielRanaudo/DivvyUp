import { describe, it, expect, vi } from "vitest";
import {
  todayISO,
  addDaysISO,
  completeChore,
  balanceSmartRotationStart,
  addMemberToSmartRotations,
  choreHistoryOutcome,
  excuseChoreOccurrence,
  isChoreComplete,
  nextAssigneeId,
  reportChoreDoneLater,
  rollOverChore,
  choreStatus,
  groupChores,
  myOpenChoreCount,
  projectOccurrences,
} from "./chores";
import type { Chore } from "./types";

const baseChore = (overrides: Partial<Chore> = {}): Chore => ({
  id: "chore-1",
  name: "Trash",
  icon: "🗑️",
  everyDays: 2,
  nextDue: todayISO(),
  assignMode: "fixed",
  assigneeId: "a",
  rotationIds: [],
  rotationIndex: 0,
  history: [],
  ...overrides,
});

describe("smart rotations", () => {
  it("balances the first turn across a batch of new chores", () => {
    const first = balanceSmartRotationStart(
      baseChore({
        id: "first",
        assignMode: "rotation",
        smartRotation: true,
        rotationIds: ["a", "b", "c"],
      }),
      []
    );
    const second = balanceSmartRotationStart(
      baseChore({
        id: "second",
        assignMode: "rotation",
        smartRotation: true,
        rotationIds: ["a", "b", "c"],
      }),
      [first]
    );
    const third = balanceSmartRotationStart(
      baseChore({
        id: "third",
        assignMode: "rotation",
        smartRotation: true,
        rotationIds: ["a", "b", "c"],
      }),
      [first, second]
    );

    expect([first.assigneeId, second.assigneeId, third.assigneeId]).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect([first.rotationIndex, second.rotationIndex, third.rotationIndex]).toEqual([
      0,
      1,
      2,
    ]);
  });

  it("adds a newcomer only to smart rotations", () => {
    const smart = baseChore({
      id: "smart",
      assignMode: "rotation",
      smartRotation: true,
      rotationIds: ["a", "b"],
    });
    const custom = baseChore({
      id: "custom",
      assignMode: "rotation",
      smartRotation: false,
      rotationIds: ["a", "b"],
    });

    const [nextSmart, nextCustom] = addMemberToSmartRotations(
      [smart, custom],
      "c"
    );
    expect(nextSmart.rotationIds).toEqual(["a", "b", "c"]);
    expect(nextSmart.assigneeId).toBe("a");
    expect(nextSmart.rotationIndex).toBe(0);
    expect(nextCustom).toBe(custom);
  });

  it("does not add the same roommate twice", () => {
    const chore = baseChore({
      assignMode: "rotation",
      smartRotation: true,
      rotationIds: ["a", "b"],
    });
    expect(addMemberToSmartRotations([chore], "b")[0]).toBe(chore);
  });
});

describe("addDaysISO", () => {
  it("adds days within a month", () => {
    expect(addDaysISO("2026-07-06", 3)).toBe("2026-07-09");
  });

  it("rolls over month and year boundaries", () => {
    expect(addDaysISO("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles leap years", () => {
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("subtracts days across month and year boundaries", () => {
    expect(addDaysISO("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDaysISO("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("completeChore", () => {
  it("logs completion, advances from the scheduled date, and stays immutable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T16:30:00.000Z"));
    try {
      const chore = baseChore({ nextDue: "2026-07-06", everyDays: 3 });
      const done = completeChore(chore);

      expect(done.history).toEqual([
        {
          date: "2026-07-06",
          assigneeId: "a",
          completedAt: "2026-07-10T16:30:00.000Z",
        },
      ]);
      // An overdue chore keeps its original cadence instead of drifting to the
      // day someone happened to catch up on it.
      expect(done.nextDue).toBe("2026-07-09");
      expect(done.assigneeId).toBe("a");
      expect(chore.nextDue).toBe("2026-07-06");
      expect(chore.history).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes a one-off chore exactly once", () => {
    const chore = baseChore({ everyDays: 0, nextDue: "2026-07-06" });
    const done = completeChore(chore);
    expect(done.history).toHaveLength(1);
    expect(done.nextDue).toBe("2026-07-06");
    expect(isChoreComplete(done)).toBe(true);

    const duplicate = completeChore(done);
    expect(duplicate).toBe(done);
    expect(duplicate.history).toHaveLength(1);
  });

  it("rotates the assignee and wraps around", () => {
    const chore = baseChore({
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "a",
    });
    const once = completeChore(chore);
    expect(once.assigneeId).toBe("b");
    expect(once.rotationIndex).toBe(1);

    const thrice = completeChore(completeChore(once));
    expect(thrice.assigneeId).toBe("a");
    expect(thrice.rotationIndex).toBe(0);
    expect(thrice.history).toHaveLength(3);
    expect(thrice.history.map((entry) => entry.assigneeId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(thrice.history.map((entry) => entry.date)).toEqual([
      todayISO(),
      addDaysISO(todayISO(), 2),
      addDaysISO(todayISO(), 4),
    ]);
  });

  it("uses the current assignee when a saved rotation index is stale", () => {
    const chore = baseChore({
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "b",
    });

    const done = completeChore(chore);
    expect(done.assigneeId).toBe("c");
    expect(done.rotationIndex).toBe(2);
  });

  it("keeps a recurring chore assigned when its rotation is empty", () => {
    const chore = baseChore({
      assignMode: "rotation",
      rotationIds: [],
      assigneeId: "a",
      nextDue: "2026-07-06",
    });

    const done = completeChore(chore);
    expect(done.assigneeId).toBe("a");
    expect(done.nextDue).toBe("2026-07-08");
  });
});

describe("automatic rollover", () => {
  it("keeps an occurrence open until its next scheduled boundary", () => {
    const chore = baseChore({ nextDue: "2026-07-06", everyDays: 3 });

    expect(
      rollOverChore(chore, "2026-07-08", "2026-07-08T12:00:00.000Z")
    ).toBe(chore);

    const rolled = rollOverChore(
      chore,
      "2026-07-09",
      "2026-07-09T12:00:00.000Z"
    );
    expect(rolled.nextDue).toBe("2026-07-09");
    expect(rolled.history).toEqual([
      {
        date: "2026-07-06",
        assigneeId: "a",
        outcome: "not_confirmed",
        recordedAt: "2026-07-09T12:00:00.000Z",
      },
    ]);
  });

  it("catches up every elapsed rotating occurrence in order", () => {
    const chore = baseChore({
      nextDue: "2026-07-01",
      everyDays: 2,
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "a",
    });

    const rolled = rollOverChore(
      chore,
      "2026-07-07",
      "2026-07-07T08:00:00.000Z"
    );
    expect(rolled.nextDue).toBe("2026-07-07");
    expect(rolled.assigneeId).toBe("a");
    expect(rolled.rotationIndex).toBe(0);
    expect(rolled.history.map((entry) => entry.date)).toEqual([
      "2026-07-01",
      "2026-07-03",
      "2026-07-05",
    ]);
    expect(rolled.history.map((entry) => entry.assigneeId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      rolled.history.every((entry) => entry.outcome === "not_confirmed")
    ).toBe(true);
  });

  it("uses the saved assignee when the rotation index is stale", () => {
    const chore = baseChore({
      nextDue: "2026-07-01",
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "b",
    });

    const rolled = rollOverChore(chore, "2026-07-03");
    expect(rolled.history[0].assigneeId).toBe("b");
    expect(rolled.assigneeId).toBe("c");
    expect(rolled.rotationIndex).toBe(2);
  });

  it("does not rotate fixed chores or automatically close one-offs", () => {
    const fixed = baseChore({ nextDue: "2026-07-01", everyDays: 2 });
    const rolled = rollOverChore(fixed, "2026-07-05");
    expect(rolled.nextDue).toBe("2026-07-05");
    expect(rolled.assigneeId).toBe("a");
    expect(rolled.history).toHaveLength(2);

    const oneOff = baseChore({ nextDue: "2026-01-01", everyDays: 0 });
    expect(rollOverChore(oneOff, "2026-07-05")).toBe(oneOff);
  });

  it("is idempotent after the saved schedule has caught up", () => {
    const first = rollOverChore(
      baseChore({ nextDue: "2026-07-01", everyDays: 2 }),
      "2026-07-05",
      "2026-07-05T08:00:00.000Z"
    );
    const second = rollOverChore(
      first,
      "2026-07-05",
      "2026-07-05T09:00:00.000Z"
    );

    expect(second).toBe(first);
    expect(second.history).toHaveLength(2);
  });
});

describe("chore history corrections", () => {
  const missed = baseChore({
    history: [
      {
        date: "2026-07-01",
        assigneeId: "a",
        outcome: "not_confirmed",
        recordedAt: "2026-07-03T08:00:00.000Z",
      },
    ],
  });

  it("lets the original assignee report completion without moving the schedule", () => {
    const reported = reportChoreDoneLater(
      missed,
      "2026-07-01",
      "a",
      "2026-07-04T10:00:00.000Z"
    );

    expect(reported.nextDue).toBe(missed.nextDue);
    expect(reported.assigneeId).toBe(missed.assigneeId);
    expect(reported.history[0]).toEqual({
      ...missed.history[0],
      outcome: "reported_later",
      completedAt: "2026-07-04T10:00:00.000Z",
    });
    expect(missed.history[0].outcome).toBe("not_confirmed");
  });

  it("does not let another roommate claim an occurrence", () => {
    expect(reportChoreDoneLater(missed, "2026-07-01", "b")).toBe(missed);
  });

  it("excuses only the selected unconfirmed occurrence", () => {
    const excused = excuseChoreOccurrence(
      missed,
      "2026-07-01",
      "a",
      "2026-07-04T11:00:00.000Z"
    );
    expect(excused.history[0]).toEqual({
      ...missed.history[0],
      outcome: "excused",
      resolvedAt: "2026-07-04T11:00:00.000Z",
    });
    expect(excused.nextDue).toBe(missed.nextDue);
  });

  it("treats legacy history as completed and not-confirmed as still open", () => {
    expect(
      choreHistoryOutcome({ date: "2026-07-01", assigneeId: "a" })
    ).toBe("completed");
    expect(
      isChoreComplete(
        baseChore({
          everyDays: 0,
          history: [
            {
              date: todayISO(),
              assigneeId: "a",
              outcome: "not_confirmed",
            },
          ],
        })
      )
    ).toBe(false);
  });
});

describe("nextAssigneeId", () => {
  it("returns the next member in rotation", () => {
    const chore = baseChore({
      assignMode: "rotation",
      rotationIds: ["a", "b"],
      rotationIndex: 0,
    });
    expect(nextAssigneeId(chore)).toBe("b");
  });

  it("returns the fixed assignee for non-rotating chores", () => {
    expect(nextAssigneeId(baseChore())).toBe("a");
  });

  it("uses the assignee rather than a stale saved index", () => {
    const chore = baseChore({
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "b",
    });
    expect(nextAssigneeId(chore)).toBe("c");
  });

  it("wraps a one-person rotation back to the same person", () => {
    const chore = baseChore({
      assignMode: "rotation",
      rotationIds: ["a"],
      rotationIndex: 0,
    });
    expect(nextAssigneeId(chore)).toBe("a");
  });
});

describe("choreStatus / groupChores / myOpenChoreCount", () => {
  const today = todayISO();
  const overdue = baseChore({ id: "o", nextDue: addDaysISO(today, -1) });
  const dueToday = baseChore({ id: "t", nextDue: today });
  const upcoming = baseChore({
    id: "u",
    nextDue: addDaysISO(today, 5),
    assigneeId: "b",
  });
  const completedOneOff = completeChore(
    baseChore({ id: "done", everyDays: 0, nextDue: today })
  );

  it("classifies chores by due date", () => {
    expect(choreStatus(overdue)).toBe("overdue");
    expect(choreStatus(dueToday)).toBe("today");
    expect(choreStatus(upcoming)).toBe("upcoming");
  });

  it("buckets and sorts chores for the agenda view", () => {
    const grouped = groupChores([
      upcoming,
      dueToday,
      overdue,
      completedOneOff,
    ]);
    expect(grouped.overdue.map((c) => c.id)).toEqual(["o"]);
    expect(grouped.today.map((c) => c.id)).toEqual(["t"]);
    expect(grouped.upcoming.map((c) => c.id)).toEqual(["u"]);
  });

  it("counts only my open (overdue or due today) chores", () => {
    const chores = [overdue, dueToday, upcoming, completedOneOff];
    expect(myOpenChoreCount(chores, "a")).toBe(2);
    expect(myOpenChoreCount(chores, "b")).toBe(0); // b's chore is upcoming
  });
});

describe("projectOccurrences", () => {
  it("projects recurring occurrences within the window (inclusive)", () => {
    const chore = baseChore({ nextDue: "2026-07-01", everyDays: 2 });
    const occ = projectOccurrences([chore], "2026-07-01", "2026-07-07");
    expect(occ.map((o) => o.date)).toEqual([
      "2026-07-01",
      "2026-07-03",
      "2026-07-05",
      "2026-07-07",
    ]);
    expect(occ.every((o) => o.assigneeId === "a")).toBe(true);
  });

  it("rotates the assignee on each projected occurrence", () => {
    const chore = baseChore({
      nextDue: "2026-07-01",
      everyDays: 1,
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "a",
    });
    const occ = projectOccurrences([chore], "2026-07-01", "2026-07-04");
    expect(occ.map((o) => o.assigneeId)).toEqual(["a", "b", "c", "a"]);
  });

  it("keeps projection in lockstep with repeated completion", () => {
    const chore = baseChore({
      nextDue: "2026-07-01",
      everyDays: 2,
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "a",
    });
    const projected = projectOccurrences(
      [chore],
      "2026-07-01",
      "2026-07-07"
    );

    const completed = [chore];
    for (let i = 0; i < 3; i++) {
      completed.push(completeChore(completed.at(-1)!));
    }

    expect(projected.map(({ date, assigneeId }) => ({ date, assigneeId }))).toEqual(
      completed.map(({ nextDue: date, assigneeId }) => ({ date, assigneeId }))
    );
  });

  it("excludes occurrences before the window and skips past overdue dates", () => {
    const chore = baseChore({ nextDue: "2026-06-28", everyDays: 3 });
    const occ = projectOccurrences([chore], "2026-07-01", "2026-07-05");
    // 06-28, 07-01, 07-04, 07-07 -> only 07-01 and 07-04 land in range
    expect(occ.map((o) => o.date)).toEqual(["2026-07-01", "2026-07-04"]);
  });

  it("yields at most one occurrence for one-off chores", () => {
    const inRange = baseChore({ everyDays: 0, nextDue: "2026-07-03" });
    const outOfRange = baseChore({ everyDays: 0, nextDue: "2026-08-01" });
    expect(
      projectOccurrences([inRange, outOfRange], "2026-07-01", "2026-07-31")
    ).toEqual([
      {
        choreId: "chore-1",
        name: "Trash",
        icon: "🗑️",
        date: "2026-07-03",
        assigneeId: "a",
        everyDays: 0,
      },
    ]);
  });

  it("does not project a completed one-off chore", () => {
    const done = completeChore(
      baseChore({ everyDays: 0, nextDue: "2026-07-03" })
    );
    expect(projectOccurrences([done], "2026-07-01", "2026-07-31")).toEqual(
      []
    );
  });

  it("fast-forwards old recurring chores without losing rotation position", () => {
    const chore = baseChore({
      nextDue: "2020-01-01",
      everyDays: 1,
      assignMode: "rotation",
      rotationIds: ["a", "b", "c"],
      rotationIndex: 0,
      assigneeId: "a",
    });

    const occ = projectOccurrences([chore], "2026-07-01", "2026-07-03");
    expect(occ.map(({ date, assigneeId }) => ({ date, assigneeId }))).toEqual([
      { date: "2026-07-01", assigneeId: "a" },
      { date: "2026-07-02", assigneeId: "b" },
      { date: "2026-07-03", assigneeId: "c" },
    ]);
  });

  it("does not mutate chores while projecting them", () => {
    const chore = baseChore({
      nextDue: "2026-07-01",
      assignMode: "rotation",
      rotationIds: ["a", "b"],
      history: [
        {
          date: "2026-06-29",
          assigneeId: "b",
          completedAt: "2026-06-29T10:00:00.000Z",
        },
      ],
    });
    const before = structuredClone(chore);

    projectOccurrences([chore], "2026-07-01", "2026-07-10");
    expect(chore).toEqual(before);
  });

  it("sorts occurrences by date then name", () => {
    const trash = baseChore({ id: "t", name: "Trash", nextDue: "2026-07-02", everyDays: 0 });
    const dishes = baseChore({ id: "d", name: "Dishes", nextDue: "2026-07-02", everyDays: 0 });
    const occ = projectOccurrences([trash, dishes], "2026-07-01", "2026-07-05");
    expect(occ.map((o) => o.name)).toEqual(["Dishes", "Trash"]);
  });
});
