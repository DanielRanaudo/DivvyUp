"use client";

import { choreHistoryOutcome } from "@/lib/chores";
import { formatDay } from "@/lib/format";
import type { Roster } from "@/lib/roster";
import { T, cardStyle } from "@/lib/tokens";
import type { Chore, ChoreCompletion, ChoreHistoryOutcome } from "@/lib/types";

const HISTORY_LIMIT = 20;
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

interface HistoryItem {
  chore: Chore;
  entry: ChoreCompletion;
  entryIndex: number;
  outcome: ChoreHistoryOutcome;
}

interface ChoreHistoryProps {
  chores: Chore[];
  members: Roster;
  currentUserId: string;
  canManageChores: boolean;
  onReportLater: (choreId: string, date: string, assigneeId: string) => void;
  onExcuse: (choreId: string, date: string, assigneeId: string) => void;
}

/** Household-visible audit trail with narrowly-scoped correction controls. */
export default function ChoreHistory({
  chores,
  members,
  currentUserId,
  canManageChores,
  onReportLater,
  onExcuse,
}: ChoreHistoryProps) {
  const items = chores
    .flatMap((chore) =>
      chore.history.map((entry, entryIndex): HistoryItem => ({
        chore,
        entry,
        entryIndex,
        outcome: choreHistoryOutcome(entry),
      }))
    )
    .sort(
      (a, b) =>
        b.entry.date.localeCompare(a.entry.date) ||
        b.entryIndex - a.entryIndex ||
        a.chore.name.localeCompare(b.chore.name)
    )
    .slice(0, HISTORY_LIMIT);

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: T.secondary,
          marginBottom: 8,
          paddingLeft: 4,
        }}
      >
        Recent history
      </div>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {items.map(({ chore, entry, entryIndex, outcome }, index) => {
          const canReport =
            outcome === "not_confirmed" &&
            entry.assigneeId === currentUserId;
          const canExcuse = outcome === "not_confirmed" && canManageChores;

          return (
            <div
              key={`${chore.id}:${entry.date}:${entry.assigneeId}:${entryIndex}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderBottom:
                  index < items.length - 1 ? `1px solid ${T.border}` : "none",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 18 }}>
                {chore.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {chore.name}
                </div>
                <div style={{ fontSize: 12, color: T.tertiary, marginTop: 2 }}>
                  {members.nameOf(entry.assigneeId)} ·{" "}
                  {formatDay(entry.date, DATE_FORMAT)} ·{" "}
                  <span style={{ color: statusColor(outcome), fontWeight: 600 }}>
                    {statusLabel(outcome)}
                  </span>
                </div>
              </div>
              {(canReport || canExcuse) && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  {canReport && (
                    <HistoryButton
                      label="I did this"
                      ariaLabel={`Report ${chore.name} done for ${entry.date}`}
                      color={T.green}
                      onClick={() =>
                        onReportLater(chore.id, entry.date, entry.assigneeId)
                      }
                    />
                  )}
                  {canExcuse && (
                    <HistoryButton
                      label="Excuse"
                      ariaLabel={`Excuse ${chore.name} for ${entry.date}`}
                      color={T.blue}
                      onClick={() =>
                        onExcuse(chore.id, entry.date, entry.assigneeId)
                      }
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryButton({
  label,
  ariaLabel,
  color,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        background: "none",
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: "5px 9px",
        color,
        fontFamily: T.font,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function statusLabel(outcome: ChoreHistoryOutcome): string {
  switch (outcome) {
    case "completed":
      return "Completed";
    case "not_confirmed":
      return "Not confirmed";
    case "reported_later":
      return "Reported later";
    case "excused":
      return "Excused";
  }
}

function statusColor(outcome: ChoreHistoryOutcome): string {
  switch (outcome) {
    case "completed":
    case "reported_later":
      return T.green;
    case "not_confirmed":
      return T.red;
    case "excused":
      return T.secondary;
  }
}
