import { formatPeriod } from "./periods";
import type { Expense, Group, Member, Payment } from "./types";

/**
 * Quotes a field the way spreadsheets expect.
 *
 * The leading apostrophe on +, -, = and @ is deliberate: Excel and Sheets treat
 * a cell starting with any of them as a formula, so a roommate who names an
 * expense "=cmd|..." would otherwise be writing code into everyone's download.
 */
function cell(value: string | number): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

/** ISO date only, which every spreadsheet and every human can read. */
function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function money(amount: number): string {
  return amount.toFixed(2);
}

function namesOf(members: Member[], splits?: Record<string, number>): string {
  if (!splits) return "";
  const byId = new Map(members.map((m) => [m.id, m.name]));
  return Object.entries(splits)
    .filter(([, share]) => share > 0)
    .map(
      ([id, share]) => `${byId.get(id) ?? "Former roommate"} ${money(share)}`
    )
    .join("; ");
}

export interface ExportRange {
  /** A closed month's key, or null for everything still open. */
  period: string | null;
  expenses: Expense[];
  payments: Payment[];
}

/**
 * One sheet covering both expenses and payments, because the question people
 * actually ask of an export — "what did this month cost me?" — needs both, and
 * two files is two chances to open the wrong one.
 */
export function buildLedgerCsv(group: Group, range: ExportRange): string {
  const rows: (string | number)[][] = [
    ["Date", "Type", "Description", "Amount", "Paid by", "Owed by", "Status"],
  ];

  for (const e of range.expenses) {
    rows.push([
      day(e.date),
      "Expense",
      e.description,
      money(e.amount),
      e.submittedByName,
      namesOf(group.members, e.splits),
      e.status,
    ]);
  }

  for (const p of range.payments) {
    rows.push([
      day(p.date),
      "Payment",
      `${p.fromName} paid ${p.toName}`,
      money(p.amount),
      p.fromName,
      p.toName,
      p.status,
    ]);
  }

  return toCsv(rows);
}

/** e.g. "Apt-4B-July-2026.csv". */
export function ledgerFilename(group: Group, period: string | null): string {
  const when = period ? formatPeriod(period) : "open";
  return `${group.name}-${when}`.replace(/[^a-z0-9]+/gi, "-") + ".csv";
}
