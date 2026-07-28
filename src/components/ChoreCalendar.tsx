"use client";

import { T } from "@/lib/tokens";
import { roster } from "@/lib/roster";
import { formatDay } from "@/lib/format";
import { todayISO, addDaysISO, projectOccurrences } from "@/lib/chores";
import type { Chore, Member } from "@/lib/types";
import Avatar from "@/components/Avatar";

interface ChoreCalendarProps {
  chores: Chore[];
  members: Member[];
  currentUser: Member;
  /** How many days ahead the calendar projects. */
  days?: number;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const isoWeekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  );
};

/**
 * A month-at-a-glance grid of every roommate's chores. Occurrences assigned to
 * the current user are highlighted in blue ("yours"); everyone else's are shown
 * in a neutral chip with the assignee's avatar so it's clear whose is whose.
 */
export default function ChoreCalendar({
  chores,
  members,
  currentUser,
  days = 30,
}: ChoreCalendarProps) {
  const today = todayISO();
  const calendarStart = today;
  const calendarEnd = addDaysISO(today, days);

  const { byId: memberById, indexOf: memberIndex } = roster(members);

  const occurrences = projectOccurrences(chores, calendarStart, calendarEnd);
  const occByDate = occurrences.reduce<Record<string, typeof occurrences>>(
    (acc, o) => {
      (acc[o.date] ??= []).push(o);
      return acc;
    },
    {}
  );

  const gridStart = addDaysISO(today, -isoWeekday(today));
  const cellCount =
    Math.ceil((daysBetween(gridStart, calendarEnd) + 1) / 7) * 7;
  const calendarCells = Array.from({ length: cellCount }, (_, i) =>
    addDaysISO(gridStart, i)
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Everyone&apos;s chores
          </h3>
          <p style={{ fontSize: 12, color: T.secondary, margin: "2px 0 0" }}>
            {formatDay(calendarStart)} – {formatDay(calendarEnd)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: T.secondary,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                background: "rgba(0,122,255,0.16)",
                border: `1px solid ${T.blue}`,
              }}
            />
            Yours
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: T.secondary,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                background: "rgba(0,0,0,0.05)",
                border: `1px solid ${T.border}`,
              }}
            />
            Roommates
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {WEEKDAY_LABELS.map((w) => (
          <div
            key={w}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 600,
              color: T.tertiary,
              padding: "4px 0",
            }}
          >
            {w}
          </div>
        ))}
        {calendarCells.map((iso) => {
          const inRange = iso >= calendarStart && iso <= calendarEnd;
          const dayItems = occByDate[iso] ?? [];
          const isToday = iso === today;
          const dayNum = Number(iso.split("-")[2]);
          return (
            <div
              key={iso}
              style={{
                minHeight: 74,
                borderRadius: T.radiusSm,
                border: isToday
                  ? `1.5px solid ${T.blue}`
                  : `1px solid ${T.border}`,
                background: inRange ? T.cardSolid : "transparent",
                opacity: inRange ? 1 : 0.35,
                padding: 5,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? T.blue : T.secondary,
                }}
              >
                {dayNum}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {dayItems.map((o, i) => {
                  const mine = o.assigneeId === currentUser.id;
                  const assignee = memberById(o.assigneeId);
                  const label = `${o.name} · ${
                    mine ? "You" : (assignee?.name ?? "Unassigned")
                  }`;
                  return (
                    <span
                      key={`${o.choreId}-${i}`}
                      title={label}
                      aria-label={label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        padding: mine ? "1px 5px 1px 4px" : "1px 4px",
                        borderRadius: 6,
                        background: mine
                          ? "rgba(0,122,255,0.14)"
                          : "rgba(0,0,0,0.05)",
                        border: mine
                          ? `1px solid ${T.blue}`
                          : `1px solid ${T.border}`,
                      }}
                    >
                      {!mine && assignee && (
                        <Avatar
                          name={assignee.name}
                          index={memberIndex(assignee.id)}
                          size={13}
                          src={assignee.avatarUrl}
                        />
                      )}
                      <span style={{ fontSize: 12, lineHeight: 1.1 }}>
                        {o.icon}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {occurrences.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: T.tertiary,
            fontSize: 14,
            paddingTop: 16,
          }}
        >
          No chores scheduled in the next {days} days
        </div>
      )}
    </div>
  );
}
