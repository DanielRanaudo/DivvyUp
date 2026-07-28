"use client";

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { T, cardStyle } from "@/lib/tokens";
import { formatDate, formatMoney } from "@/lib/format";
import { archivedIn, formatPeriod, pageOf } from "@/lib/periods";
import {
  fetchArchivedExpenses,
  fetchArchivedMonth,
  fetchArchivedPayments,
} from "@/lib/api";
import ExportCsvButton from "@/components/ExportCsvButton";
import {
  usePagedList,
  type PagedList,
  type PageSource,
} from "@/hooks/usePagedList";
import type { ClosedPeriod, Expense, Group, Payment } from "@/lib/types";

const PAGE_SIZE = 10;

interface PeriodArchiveProps {
  group: Group;
  /** Null in sandbox mode, where the history is already in memory. */
  supabase: SupabaseClient | null;
  periods: ClosedPeriod[];
}

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 18px",
  fontSize: 14,
  borderTop: `1px solid ${T.border}`,
};

/**
 * The months that have been closed. Their contents are no longer loaded with
 * the group, so opening one fetches it a page at a time.
 */
export default function PeriodArchive({
  group,
  supabase,
  periods,
}: PeriodArchiveProps) {
  const [open, setOpen] = useState<string | null>(null);

  if (periods.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: T.tertiary,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 10,
        }}
      >
        Past Months
      </h3>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {[...periods].reverse().map((p) => (
          <div key={p.id}>
            <button
              onClick={() => setOpen(open === p.period ? null : p.period)}
              aria-expanded={open === p.period}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                background: "none",
                border: "none",
                borderTop: `1px solid ${T.border}`,
                fontFamily: T.font,
                fontSize: 15,
                color: T.text,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span style={{ flex: 1, fontWeight: 600 }}>
                {formatPeriod(p.period)}
              </span>
              <span style={{ fontSize: 13, color: T.tertiary }}>
                {p.totals.expenses} expense
                {p.totals.expenses === 1 ? "" : "s"}
              </span>
              <span style={{ fontFamily: T.mono, fontWeight: 600 }}>
                {formatMoney(p.totals.spend)}
              </span>
              <span aria-hidden="true" style={{ color: T.tertiary }}>
                {open === p.period ? "▴" : "▾"}
              </span>
            </button>
            {open === p.period && (
              <ArchivedMonth group={group} supabase={supabase} period={p} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchivedMonth({
  group,
  supabase,
  period,
}: {
  group: Group;
  supabase: SupabaseClient | null;
  period: ClosedPeriod;
}) {
  const key = period.period;

  // Sandbox mode has no server to ask, so it pages the copy in memory.
  const localExpenses = useMemo(
    () => archivedIn(group.expenses, key),
    [group.expenses, key]
  );
  const localPayments = useMemo(
    () => archivedIn(group.payments, key),
    [group.payments, key]
  );

  const expenseSource = useCallback<PageSource<Expense>>(
    (offset, limit) =>
      supabase
        ? fetchArchivedExpenses(supabase, group.id, key, offset, limit)
        : Promise.resolve(pageOf(localExpenses, offset, limit)),
    [supabase, group.id, key, localExpenses]
  );
  const paymentSource = useCallback<PageSource<Payment>>(
    (offset, limit) =>
      supabase
        ? fetchArchivedPayments(supabase, group.id, key, offset, limit)
        : Promise.resolve(pageOf(localPayments, offset, limit)),
    [supabase, group.id, key, localPayments]
  );

  const expenses = usePagedList(expenseSource, `e-${key}`, PAGE_SIZE);
  const payments = usePagedList(paymentSource, `p-${key}`, PAGE_SIZE);

  const carried = period.carryover;

  const exportRange = useCallback(
    async () => ({
      period: key,
      ...(supabase
        ? await fetchArchivedMonth(supabase, group.id, key)
        : { expenses: localExpenses, payments: localPayments }),
    }),
    [supabase, group.id, key, localExpenses, localPayments]
  );

  return (
    <div style={{ background: T.bg }}>
      {carried.length > 0 && (
        <div style={{ ...rowStyle, color: T.secondary, fontSize: 13 }}>
          {carried.length} debt{carried.length === 1 ? "" : "s"} carried into
          the next month
        </div>
      )}

      {expenses.items.map((e) => (
        <div key={e.id} style={rowStyle}>
          <span style={{ flex: 1 }}>{e.description}</span>
          <span style={{ fontSize: 12, color: T.tertiary }}>
            {formatDate(e.date)}
          </span>
          <span style={{ fontFamily: T.mono, fontWeight: 600 }}>
            {formatMoney(e.amount)}
          </span>
        </div>
      ))}
      <MoreRow list={expenses} label="expenses" />

      {payments.items.map((p) => (
        <div key={p.id} style={rowStyle}>
          <span style={{ flex: 1, color: T.secondary }}>
            {p.fromName} paid {p.toName}
          </span>
          <span style={{ fontSize: 12, color: T.tertiary }}>
            {formatDate(p.date)}
          </span>
          <span style={{ fontFamily: T.mono, fontWeight: 600 }}>
            {formatMoney(p.amount)}
          </span>
        </div>
      ))}
      <MoreRow list={payments} label="payments" />

      {!expenses.loading &&
        !payments.loading &&
        expenses.items.length === 0 &&
        payments.items.length === 0 && (
          <div style={{ ...rowStyle, color: T.tertiary }}>
            Nothing was recorded that month.
          </div>
        )}

      <div style={rowStyle}>
        <ExportCsvButton
          group={group}
          range={exportRange}
          label={`Export ${formatPeriod(key)}`}
        />
      </div>
    </div>
  );
}

function MoreRow({
  list,
  label,
}: {
  list: PagedList<Expense | Payment>;
  label: string;
}) {
  if (list.error) {
    return (
      <div style={{ ...rowStyle, color: T.red, fontSize: 13 }}>
        Couldn&apos;t load the {label} — {list.error}
      </div>
    );
  }
  if (!list.hasMore) return null;
  return (
    <div style={rowStyle}>
      <button
        onClick={list.loadMore}
        disabled={list.loading}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: T.blue,
          fontFamily: T.font,
          fontSize: 14,
          fontWeight: 600,
          cursor: list.loading ? "default" : "pointer",
        }}
      >
        {list.loading ? "Loading…" : `Show more ${label}`}
      </button>
    </div>
  );
}
