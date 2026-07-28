import { describe, it, expect } from "vitest";
import {
  buildReminders,
  tasksFrom,
  type MemberRow,
  type ReminderTask,
} from "@/lib/reminders";

const NOW = new Date("2026-07-27T12:00:00Z");
const THREE_DAYS_AGO = "2026-07-24T12:00:00.000Z";
const AN_HOUR_AGO = "2026-07-27T11:00:00.000Z";
const SITE = "https://divvyup.app";

function approval(overrides: Partial<ReminderTask> = {}): ReminderTask {
  return {
    kind: "approval",
    recipient: { email: "alex@example.com", name: "Alex" },
    groupName: "Apt 4B",
    who: "Bea",
    what: "Soap",
    amount: 60,
    since: THREE_DAYS_AGO,
    ...overrides,
  };
}

function payment(overrides: Partial<ReminderTask> = {}): ReminderTask {
  return approval({
    kind: "payment",
    who: "Bea",
    what: "",
    amount: 30,
    ...overrides,
  });
}

describe("buildReminders", () => {
  it("says what is waiting and who it is waiting on", () => {
    const [mail] = buildReminders([approval()], SITE, NOW);

    expect(mail.to).toBe("alex@example.com");
    expect(mail.subject).toBe("DivvyUp: 1 expense to approve");
    expect(mail.text).toContain("Hi Alex,");
    expect(mail.text).toContain("Apt 4B:");
    expect(mail.text).toContain(
      "• Bea submitted Soap for $60.00 — waiting for 3 days."
    );
    expect(mail.text).toContain(SITE);
  });

  it("words a payment as something to confirm, not approve", () => {
    const [mail] = buildReminders([payment()], SITE, NOW);

    expect(mail.subject).toBe("DivvyUp: 1 payment to confirm");
    expect(mail.text).toContain("• Bea says they paid you $30.00");
  });

  it("sends one email per person, not one per thing", () => {
    const mails = buildReminders(
      [
        approval(),
        payment(),
        approval({ recipient: { email: "cam@example.com", name: "Cam" } }),
      ],
      SITE,
      NOW
    );

    expect(mails).toHaveLength(2);
    expect(mails[0].subject).toBe(
      "DivvyUp: 1 expense to approve and 1 payment to confirm"
    );
  });

  it("keeps two houses apart in the same email", () => {
    const [mail] = buildReminders(
      [approval(), approval({ groupName: "Beach House", what: "Firewood" })],
      SITE,
      NOW
    );

    expect(mail.text).toContain("Apt 4B:");
    expect(mail.text).toContain("Beach House:");
    expect(mail.subject).toBe("DivvyUp: 2 expenses to approve");
  });

  it("waits a day before nudging anyone", () => {
    expect(
      buildReminders([approval({ since: AN_HOUR_AGO })], SITE, NOW)
    ).toEqual([]);
  });

  it("leads with whatever has been waiting longest", () => {
    const [mail] = buildReminders(
      [
        approval({ what: "Newer", since: "2026-07-25T12:00:00.000Z" }),
        approval({ what: "Older", since: "2026-07-20T12:00:00.000Z" }),
      ],
      SITE,
      NOW
    );

    expect(mail.text.indexOf("Older")).toBeLessThan(mail.text.indexOf("Newer"));
  });

  it("treats a person's two addresses as one inbox", () => {
    const mails = buildReminders(
      [
        approval(),
        approval({ recipient: { email: "Alex@Example.com", name: "Alex" } }),
      ],
      SITE,
      NOW
    );

    expect(mails).toHaveLength(1);
  });

  it("skips a member who has no email on file", () => {
    expect(
      buildReminders(
        [approval({ recipient: { email: "", name: "Ghost" } })],
        SITE,
        NOW
      )
    ).toEqual([]);
  });
});

describe("tasksFrom", () => {
  const groups = [{ id: "g1", name: "Apt 4B" }];
  const members: MemberRow[] = [
    {
      id: "a",
      group_id: "g1",
      name: "Alex",
      is_treasurer: true,
      email: "alex@example.com",
    },
    {
      id: "b",
      group_id: "g1",
      name: "Bea",
      is_treasurer: false,
      email: "bea@example.com",
    },
  ];
  const pendingExpense = {
    group_id: "g1",
    description: "Soap",
    amount: 60,
    date: THREE_DAYS_AGO,
    submitted_by_name: "Bea",
  };
  const pendingPayment = {
    group_id: "g1",
    to_id: "a",
    from_name: "Bea",
    amount: 30,
    date: THREE_DAYS_AGO,
  };

  it("points an unapproved expense at the treasurer", () => {
    const [task] = tasksFrom(groups, members, [pendingExpense], []);

    expect(task).toMatchObject({
      kind: "approval",
      recipient: { email: "alex@example.com", name: "Alex" },
      groupName: "Apt 4B",
      who: "Bea",
      what: "Soap",
    });
  });

  it("points an unconfirmed payment at whoever was supposedly paid", () => {
    const [task] = tasksFrom(groups, members, [], [pendingPayment]);

    expect(task).toMatchObject({
      kind: "payment",
      recipient: { email: "alex@example.com" },
      who: "Bea",
      amount: 30,
    });
  });

  it("nudges every treasurer when a house has more than one", () => {
    const two = members.map((m) => ({ ...m, is_treasurer: true }));
    expect(tasksFrom(groups, two, [pendingExpense], [])).toHaveLength(2);
  });

  it("drops a payment to someone who has left the house", () => {
    expect(
      tasksFrom(groups, members, [], [{ ...pendingPayment, to_id: null }])
    ).toEqual([]);
  });

  it("still names the house when the group row is missing", () => {
    const [task] = tasksFrom([], members, [pendingExpense], []);
    expect(task.groupName).toBe("Your house");
  });
});
