"use client";

import { T } from "@/lib/tokens";
import { formatDay } from "@/lib/format";
import { choreStatus, nextAssigneeId } from "@/lib/chores";
import type { Roster } from "@/lib/roster";
import type { Chore } from "@/lib/types";
import Avatar from "@/components/Avatar";

const DUE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};

interface ChoreRowProps {
  chore: Chore;
  members: Roster;
  currentUserId: string;
  onDone: (choreId: string) => void;
  onDelete: (chore: Chore) => void;
}

/** One chore on the board: whose it is, when it's due, and how to close it. */
export default function ChoreRow({
  chore,
  members,
  currentUserId,
  onDone,
  onDelete,
}: ChoreRowProps) {
  const assignee = members.byId(chore.assigneeId);
  const mine = chore.assigneeId === currentUserId;
  const overdue = choreStatus(chore) === "overdue";
  const upNext = nextAssigneeId(chore);
  // Only worth naming when the rotation actually moves on.
  const showUpNext =
    chore.assignMode === "rotation" &&
    chore.everyDays > 0 &&
    upNext !== chore.assigneeId &&
    members.byId(upNext) !== undefined;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderLeft: `3px solid ${overdue ? T.red : T.blue}`,
      }}
    >
      <ChoreIcon icon={chore.icon} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>
          {chore.name}
          {chore.everyDays > 0 && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: T.blue,
                fontWeight: 600,
              }}
            >
              {chore.everyDays === 1
                ? "Daily"
                : `Every ${chore.everyDays} days`}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
          }}
        >
          {assignee && (
            <Avatar
              name={assignee.name}
              index={members.indexOf(assignee.id)}
              size={18}
              src={assignee.avatarUrl}
            />
          )}
          <span style={{ fontSize: 13, color: T.tertiary }}>
            {assignee ? (mine ? "You" : assignee.name) : "Unassigned"} ·{" "}
            {overdue ? (
              <span style={{ color: T.red, fontWeight: 600 }}>
                Overdue · {formatDay(chore.nextDue, DUE_FORMAT)}
              </span>
            ) : (
              formatDay(chore.nextDue, DUE_FORMAT)
            )}
          </span>
        </div>
        {showUpNext && (
          <div style={{ fontSize: 11, color: T.tertiary, marginTop: 2 }}>
            then → {members.nameOf(upNext)}
          </div>
        )}
      </div>
      <button
        onClick={() => onDone(chore.id)}
        disabled={!mine}
        title={
          mine ? undefined : "Only the assigned roommate can mark this done"
        }
        style={{
          padding: "7px 14px",
          borderRadius: 20,
          border: "none",
          background: mine ? T.green : T.bg,
          color: mine ? "#fff" : T.tertiary,
          fontFamily: T.font,
          fontSize: 13,
          fontWeight: 600,
          cursor: mine ? "pointer" : "not-allowed",
        }}
      >
        Done
      </button>
      <button
        onClick={() => onDelete(chore)}
        aria-label={`Delete ${chore.name}`}
        style={{
          background: "none",
          border: "none",
          color: T.tertiary,
          cursor: "pointer",
          fontSize: 18,
          padding: "0 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}

interface UpcomingRowProps {
  icon: string;
  name: string;
  date: string;
  last: boolean;
}

/** A chore that lands on you tomorrow; nothing to do about it yet. */
export function UpcomingChoreRow({ icon, name, date, last }: UpcomingRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderLeft: `3px solid ${T.secondary}`,
        borderBottom: last ? "none" : `1px solid ${T.border}`,
      }}
    >
      <ChoreIcon icon={icon} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>{name}</div>
        <div style={{ fontSize: 13, color: T.tertiary, marginTop: 4 }}>
          Yours tomorrow · {formatDay(date, DUE_FORMAT)}
        </div>
      </div>
    </div>
  );
}

function ChoreIcon({ icon }: { icon: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: "rgba(0,0,0,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 19,
      }}
    >
      {icon}
    </div>
  );
}
