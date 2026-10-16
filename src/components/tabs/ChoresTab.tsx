"use client";

import { useState } from "react";
import { T, cardStyle, secTitle } from "@/lib/tokens";
import { roster } from "@/lib/roster";
import {
  todayISO,
  addDaysISO,
  completeChore,
  balanceSmartRotationStart,
  excuseChoreOccurrence,
  isChoreComplete,
  projectOccurrences,
  reportChoreDoneLater,
  rollOverChore,
} from "@/lib/chores";
import type { Group, Member, Chore } from "@/lib/types";
import ChoreCalendar from "@/components/ChoreCalendar";
import ChoreForm from "@/components/chores/ChoreForm";
import ChoreHistory from "@/components/chores/ChoreHistory";
import ChoreRow, { UpcomingChoreRow } from "@/components/chores/ChoreRow";
import ConfirmDialog from "@/components/ConfirmDialog";
import { usePendingDelete } from "@/hooks/usePendingDelete";

interface ChoresTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  currentUser: Member;
  canManageChores: boolean;
}

type FormState =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; id: string };

export default function ChoresTab({
  group,
  setGroup,
  currentUser,
  canManageChores,
}: ChoresTabProps) {
  const chores = group.chores ?? [];
  const members = roster(group.members);
  const [form, setForm] = useState<FormState>({ kind: "closed" });
  const editing =
    form.kind === "edit"
      ? (chores.find((chore) => chore.id === form.id) ?? null)
      : null;

  const editChores = (change: (chores: Chore[]) => Chore[]) =>
    setGroup((prev) => ({ ...prev, chores: change(prev.chores ?? []) }));

  const addChore = (chore: Chore) => {
    editChores((prev) => {
      const balanced = balanceSmartRotationStart(chore, prev);
      return [...prev, rollOverChore(balanced, todayISO())];
    });
    setForm({ kind: "closed" });
  };

  const saveChore = (chore: Chore) => {
    editChores((prev) =>
      prev.map((existing) =>
        existing.id === chore.id ? rollOverChore(chore, todayISO()) : existing
      )
    );
    setForm({ kind: "closed" });
  };

  const markDone = (choreId: string) =>
    editChores((prev) =>
      prev.map((c) => (c.id === choreId ? completeChore(c) : c))
    );

  const reportLater = (
    choreId: string,
    date: string,
    assigneeId: string
  ) =>
    editChores((prev) =>
      prev.map((chore) =>
        chore.id === choreId
          ? reportChoreDoneLater(chore, date, assigneeId)
          : chore
      )
    );

  const excuseOccurrence = (
    choreId: string,
    date: string,
    assigneeId: string
  ) =>
    editChores((prev) =>
      prev.map((chore) =>
        chore.id === choreId
          ? excuseChoreOccurrence(chore, date, assigneeId)
          : chore
      )
    );

  const removal = usePendingDelete<Chore>((chore) => {
    editChores((prev) => prev.filter((c) => c.id !== chore.id));
    setForm((current) =>
      current.kind === "edit" && current.id === chore.id
        ? { kind: "closed" }
        : current
    );
  });

  const today = todayISO();
  // "Today" is the shared board: every chore due today or overdue, so the
  // household can see what still needs doing. "Tomorrow" is a personal
  // heads-up: only the chores the current user is handed next.
  const dueToday = chores
    .filter((c) => !isChoreComplete(c) && c.nextDue <= today)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const mineTomorrow = projectOccurrences(
    chores,
    addDaysISO(today, 1),
    addDaysISO(today, 1)
  ).filter((o) => o.assigneeId === currentUser.id);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ ...secTitle, marginBottom: 4 }}>Chores</h2>
          <p style={{ fontSize: 14, color: T.secondary, margin: 0 }}>
            Recurring tasks, assigned or rotated
          </p>
        </div>
        <button
          onClick={() =>
            setForm((current) =>
              current.kind === "closed" ? { kind: "new" } : { kind: "closed" }
            )
          }
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            background: form.kind === "closed" ? T.blue : T.bg,
            color: form.kind === "closed" ? "#fff" : T.text,
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {form.kind === "closed" ? "+ Add" : "Cancel"}
        </button>
      </div>

      {form.kind === "new" && (
        // Remounting on close throws the half-filled form away, which is what
        // "Cancel" is understood to mean.
        <ChoreForm
          members={group.members}
          currentUser={currentUser}
          onSubmit={addChore}
        />
      )}

      {editing && canManageChores && (
        <ChoreForm
          key={editing.id}
          members={group.members}
          currentUser={currentUser}
          initialChore={editing}
          onSubmit={saveChore}
        />
      )}

      {canManageChores &&
        chores.some((chore) => !isChoreComplete(chore)) && (
        <div style={{ marginBottom: 20 }}>
          <DayLabel color={T.secondary}>Manage schedules</DayLabel>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {chores
              .filter((chore) => !isChoreComplete(chore))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((chore, index, activeChores) => (
                <div
                  key={chore.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderBottom:
                      index < activeChores.length - 1
                        ? `1px solid ${T.border}`
                        : "none",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 18 }}>
                    {chore.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {chore.name}
                    </div>
                    <div style={{ fontSize: 12, color: T.tertiary }}>
                      {chore.everyDays <= 0
                        ? "One time"
                        : chore.everyDays === 1
                          ? "Daily"
                          : `Every ${chore.everyDays} days`}
                      {" · "}
                      {chore.assignMode === "rotation"
                        ? `${chore.smartRotation ? "Smart · " : ""}${
                            chore.rotationIds.length
                          }-person rotation · ${
                            chore.history.length === 0
                              ? "starts with"
                              : "current turn"
                          } ${members.nameOf(chore.assigneeId)}`
                        : members.nameOf(chore.assigneeId)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setForm({ kind: "edit", id: chore.id })}
                      aria-label={`Edit ${chore.name}`}
                      style={{
                        background: "none",
                        border: `1px solid ${T.border}`,
                        borderRadius: 8,
                        padding: "5px 12px",
                        color: T.blue,
                        fontFamily: T.font,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removal.ask(chore)}
                      aria-label={`Delete ${chore.name}`}
                      style={{
                        background: "none",
                        border: `1px solid ${T.border}`,
                        borderRadius: 8,
                        padding: "5px 12px",
                        color: T.red,
                        fontFamily: T.font,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {chores.length === 0 && form.kind === "closed" && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: T.tertiary,
            fontSize: 15,
          }}
        >
          No chores yet
        </div>
      )}

      {chores.length > 0 && (
        <>
          <div className="chores-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <DayLabel color={T.blue}>Today</DayLabel>
                {dueToday.length === 0 ? (
                  <Empty>Nothing due today</Empty>
                ) : (
                  <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                    {dueToday.map((chore, i) => (
                      <div
                        key={chore.id}
                        style={{
                          borderBottom:
                            i < dueToday.length - 1
                              ? `1px solid ${T.border}`
                              : "none",
                        }}
                      >
                        <ChoreRow
                          chore={chore}
                          members={members}
                          currentUserId={currentUser.id}
                          onDone={markDone}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <DayLabel color={T.secondary}>
                  Tomorrow · your chores
                </DayLabel>
                {mineTomorrow.length === 0 ? (
                  <Empty>No chores assigned to you tomorrow</Empty>
                ) : (
                  <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                    {mineTomorrow.map((occ, i) => (
                      <UpcomingChoreRow
                        key={occ.choreId}
                        icon={occ.icon}
                        name={occ.name}
                        date={occ.date}
                        last={i === mineTomorrow.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={cardStyle}>
              <ChoreCalendar
                chores={chores}
                members={group.members}
                currentUser={currentUser}
              />
            </div>
          </div>

          <ChoreHistory
            chores={chores}
            members={members}
            currentUserId={currentUser.id}
            canManageChores={canManageChores}
            onReportLater={reportLater}
            onExcuse={excuseOccurrence}
          />
        </>
      )}

      <ConfirmDialog
        open={removal.target !== null}
        title={`Delete ${removal.target?.name ?? "chore"}?`}
        message="Nobody will be asked to do it again, and its place in the rotation goes with it."
        confirmLabel="Delete"
        destructive
        onConfirm={removal.confirm}
        onCancel={removal.cancel}
      />
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
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color,
        marginBottom: 8,
        paddingLeft: 4,
      }}
    >
      {children}
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
      }}
    >
      {children}
    </div>
  );
}
