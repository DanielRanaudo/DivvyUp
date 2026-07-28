"use client";

import { useState } from "react";
import { T, cardStyle, secTitle } from "@/lib/tokens";
import { roster } from "@/lib/roster";
import {
  todayISO,
  addDaysISO,
  completeChore,
  projectOccurrences,
} from "@/lib/chores";
import type { Group, Member, Chore } from "@/lib/types";
import ChoreCalendar from "@/components/ChoreCalendar";
import ChoreForm from "@/components/chores/ChoreForm";
import ChoreRow, { UpcomingChoreRow } from "@/components/chores/ChoreRow";
import ConfirmDialog from "@/components/ConfirmDialog";
import { usePendingDelete } from "@/hooks/usePendingDelete";

interface ChoresTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  currentUser: Member;
}

export default function ChoresTab({
  group,
  setGroup,
  currentUser,
}: ChoresTabProps) {
  const chores = group.chores ?? [];
  const members = roster(group.members);
  const [showForm, setShowForm] = useState(false);

  const editChores = (change: (chores: Chore[]) => Chore[]) =>
    setGroup((prev) => ({ ...prev, chores: change(prev.chores ?? []) }));

  const addChore = (chore: Chore) => {
    editChores((prev) => [...prev, chore]);
    setShowForm(false);
  };

  const markDone = (choreId: string) =>
    editChores((prev) =>
      prev.map((c) => (c.id === choreId ? completeChore(c) : c))
    );

  const removal = usePendingDelete<Chore>((chore) =>
    editChores((prev) => prev.filter((c) => c.id !== chore.id))
  );

  const today = todayISO();
  // "Today" is the shared board: every chore due today or overdue, so the
  // household can see what still needs doing. "Tomorrow" is a personal
  // heads-up: only the chores the current user is handed next.
  const dueToday = chores
    .filter((c) => c.nextDue <= today)
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
          onClick={() => setShowForm((open) => !open)}
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            background: showForm ? T.bg : T.blue,
            color: showForm ? T.text : "#fff",
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showForm && (
        // Remounting on close throws the half-filled form away, which is what
        // "Cancel" is understood to mean.
        <ChoreForm
          members={group.members}
          currentUser={currentUser}
          onAdd={addChore}
        />
      )}

      {chores.length === 0 && !showForm && (
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
                        onDelete={removal.ask}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <DayLabel color={T.secondary}>Tomorrow · your chores</DayLabel>
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
