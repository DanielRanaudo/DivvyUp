import { describe, it, expect } from "vitest";
import { buildLedgerCsv, ledgerFilename, toCsv } from "@/lib/csv";
import type { Group, Member } from "@/lib/types";

function member(id: string, name: string): Member {
  return { id, name, venmo: "", zelle: "", isTreasurer: false };
}

function group(): Group {
  return {
    id: "g1",
    name: "Apt 4B",
    code: "ABC1234567",
    members: [member("a", "Alex"), member("b", "Bea")],
    rent: null,
    utilities: [],
    expenses: [],
    payments: [],
    subgroups: [],
    chores: [],
    periods: [],
    smartSettle: false,
    docsVersion: 0,
  };
}

describe("toCsv", () => {
  it("quotes fields that would otherwise break the row", () => {
    expect(toCsv([["Soap, dish", 'He said "hi"', "two\nlines"]])).toBe(
      '"Soap, dish","He said ""hi""","two\nlines"'
    );
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    expect(toCsv([["=1+1"], ["+cmd"], ["@SUM(A1)"], ["-5"]])).toBe(
      "'=1+1\r\n'+cmd\r\n'@SUM(A1)\r\n'-5"
    );
  });

  it("separates rows the way spreadsheets expect", () => {
    expect(toCsv([["a", "b"], ["c"]])).toBe("a,b\r\nc");
  });
});

describe("buildLedgerCsv", () => {
  const range = {
    period: null,
    expenses: [
      {
        id: "e1",
        description: "Soap",
        amount: 60,
        submittedBy: "a",
        submittedByName: "Alex",
        status: "approved" as const,
        splits: { a: 30, b: 30 },
        date: "2026-07-02T10:00:00.000Z",
      },
    ],
    payments: [
      {
        id: "p1",
        fromId: "b",
        fromName: "Bea",
        toId: "a",
        toName: "Alex",
        amount: 30,
        status: "confirmed" as const,
        date: "2026-07-09T10:00:00.000Z",
      },
    ],
  };

  it("lists expenses and payments under one header", () => {
    const lines = buildLedgerCsv(group(), range).split("\r\n");

    expect(lines[0]).toBe(
      "Date,Type,Description,Amount,Paid by,Owed by,Status"
    );
    expect(lines[1]).toBe(
      "2026-07-02,Expense,Soap,60.00,Alex,Alex 30.00; Bea 30.00,approved"
    );
    expect(lines[2]).toBe(
      "2026-07-09,Payment,Bea paid Alex,30.00,Bea,Alex,confirmed"
    );
  });

  it("names someone who has since moved out rather than showing an id", () => {
    const csv = buildLedgerCsv(group(), {
      ...range,
      expenses: [{ ...range.expenses[0], splits: { gone: 60 } }],
    });

    expect(csv).toContain("Former roommate 60.00");
  });

  it("leaves an unsplit expense's share column empty", () => {
    const csv = buildLedgerCsv(group(), {
      ...range,
      payments: [],
      expenses: [
        {
          ...range.expenses[0],
          status: "pending" as const,
          splits: undefined,
        },
      ],
    });

    expect(csv.split("\r\n")[1]).toBe(
      "2026-07-02,Expense,Soap,60.00,Alex,,pending"
    );
  });
});

describe("ledgerFilename", () => {
  it("names the month it covers", () => {
    expect(ledgerFilename(group(), "2026-07-01")).toBe("Apt-4B-July-2026.csv");
  });

  it("says so when the month is still running", () => {
    expect(ledgerFilename(group(), null)).toBe("Apt-4B-open.csv");
  });
});
