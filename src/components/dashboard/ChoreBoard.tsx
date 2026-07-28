"use client";

import { T, cardStyle } from "@/lib/tokens";
import { roster } from "@/lib/roster";
import {
  todayISO,
  addDaysISO,
  choreStatus,
  projectOccurrences,
} from "@/lib/chores";
import type { Chore, Member } from "@/lib/types";
import Avatar from "@/components/Avatar";

interface ChoreBoardProps {
  chores: Chore[];
  members: Member[];
  currentUser: Member;
  onDone: (choreId: string) => void;
  onViewAll: () => void;
}

/**
 * Today's board and a look at tomorrow.
 *
 * Today shows everything still owed, overdue included, because a chore nobody
 * did yesterday is today's problem.
 */
export default function ChoreBoard({
  chores,
  members,
  currentUser,
  onDone,
  onViewAll,
}: ChoreBoardProps) {
  const { byId, indexOf } = roster(members);
  const today = todayISO();
  const dueToday = chores
    .filter((c) => c.nextDue <= today)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const tomorrow = addDaysISO(today, 1);
  const dueTomorrow = projectOccurrences(chores, tomorrow, tomorrow);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.secondary,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          Chores
        </h3>
        <button
          onClick={onViewAll}
          style={{
            background: "none",
            border: "none",
            color: T.blue,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font,
            padding: 0,
          }}
        >
          View all
        </button>
      </div>

      {chores.length === 0 ? (
        <Empty>No chores yet</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <DayLabel color={T.blue}>Today</DayLabel>
            {dueToday.length === 0 ? (
              <Empty>No chores left today 🎉</Empty>
            ) : (
              <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                {dueToday.map((chore, i) => {
                  const assignee = byId(chore.assigneeId);
                  const mine = chore.assigneeId === currentUser.id;
                  const overdue = choreStatus(chore) === "overdue";
                  return (
                    <Row
                      key={chore.id}
                      accent={overdue ? T.red : T.blue}
                      last={i === dueToday.length - 1}
                      icon={chore.icon}
                      name={chore.name}
                      detail={
                        <>
                          {assignee
                            ? mine
                              ? "You"
                              : assignee.name
                            : "Unassigned"}{" "}
                          ·{" "}
                          {overdue ? (
                            <span style={{ color: T.red, fontWeight: 600 }}>
                              Overdue
                            </span>
                          ) : (
                            "Today"
                          )}
                        </>
                      }
                      action={
                        <button
                          onClick={() => onDone(chore.id)}
                          disabled={!mine}
                          title={
                            mine
                              ? undefined
                              : "Only the assigned roommate can mark this done"
                          }
                          style={{
                            padding: "5px 10px",
                            borderRadius: 16,
                            border: "none",
                            background: mine ? T.green : T.bg,
                            color: mine ? "#fff" : T.tertiary,
                            fontFamily: T.font,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: mine ? "pointer" : "not-allowed",
                            flexShrink: 0,
                          }}
                        >
                          Done
                        </button>
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <DayLabel color={T.secondary}>Tomorrow</DayLabel>
            {dueTomorrow.length === 0 ? (
              <Empty>Nothing due tomorrow</Empty>
            ) : (
              <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                {dueTomorrow.map((occ, i) => {
                  const assignee = byId(occ.assigneeId);
                  const mine = occ.assigneeId === currentUser.id;
                  return (
                    <Row
                      key={`${occ.choreId}-${i}`}
                      accent={T.secondary}
                      last={i === dueTomorrow.length - 1}
                      icon={occ.icon}
                      name={occ.name}
                      detail={
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          {assignee && (
                            <Avatar
                              name={assignee.name}
                              index={indexOf(assignee.id)}
                              size={16}
                              src={assignee.avatarUrl}
                            />
                          )}
                          {assignee
                            ? mine
                              ? "You"
                              : assignee.name
                            : "Unassigned"}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...cardStyle,
        textAlign: "center",
        color: T.tertiary,
        fontSize: 14,
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

function DayLabel({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color,
        marginBottom: 6,
        paddingLeft: 2,
      }}
    >
      {children}
    </div>
  );
}

interface RowProps {
  accent: string;
  last: boolean;
  icon: string;
  name: string;
  detail: React.ReactNode;
  action?: React.ReactNode;
}

function Row({ accent, last, icon, name, detail, action }: RowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderLeft: `3px solid ${accent}`,
        borderBottom: last ? "none" : `1px solid ${T.border}`,
      }}
    >
      <div style={{ fontSize: 18 }} aria-hidden="true">
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: 14,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 12, color: T.tertiary, marginTop: 1 }}>
          {detail}
        </div>
      </div>
      {action}
    </div>
  );
}
