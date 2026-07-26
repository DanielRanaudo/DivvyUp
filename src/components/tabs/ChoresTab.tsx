"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle, cardStyle, secTitle } from "@/lib/tokens";
import { uid } from "@/lib/utils";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import {
  todayISO,
  addDaysISO,
  completeChore,
  nextAssigneeId,
  choreStatus,
  projectOccurrences,
} from "@/lib/chores";
import type { Group, Member, Chore } from "@/lib/types";
import Avatar from "@/components/Avatar";
import ChoreCalendar from "@/components/ChoreCalendar";

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
  const memberById: Record<string, Member> = {};
  group.members.forEach((m) => (memberById[m.id] = m));
  const memberIndex = (id: string) =>
    group.members.findIndex((m) => m.id === id);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🧹");
  const [everyDays, setEveryDays] = useState("2");
  const [startDate, setStartDate] = useState(todayISO());
  const [assignMode, setAssignMode] = useState<"fixed" | "rotation">("fixed");
  const [fixedAssignee, setFixedAssignee] = useState(currentUser.id);
  const [rotationIds, setRotationIds] = useState<string[]>([currentUser.id]);

  const resetForm = () => {
    setName("");
    setIcon("🧹");
    setEveryDays("2");
    setStartDate(todayISO());
    setAssignMode("fixed");
    setFixedAssignee(currentUser.id);
    setRotationIds([currentUser.id]);
    setShowForm(false);
  };

  const toggleRotationMember = (id: string) => {
    setRotationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const canSubmit =
    name.trim() &&
    startDate &&
    (assignMode === "fixed"
      ? Boolean(fixedAssignee)
      : rotationIds.length > 0);

  const addChore = () => {
    if (!canSubmit) return;
    const days = parseInt(everyDays, 10);
    const chore: Chore = {
      id: uid(),
      name: name.trim(),
      icon: icon.trim() || "🧹",
      everyDays: isNaN(days) || days < 0 ? 0 : days,
      nextDue: startDate,
      assignMode,
      assigneeId: assignMode === "fixed" ? fixedAssignee : rotationIds[0],
      rotationIds: assignMode === "rotation" ? rotationIds : [],
      rotationIndex: 0,
      history: [],
    };
    setGroup((prev) => ({ ...prev, chores: [...(prev.chores ?? []), chore] }));
    resetForm();
  };

  const markDone = (choreId: string) => {
    setGroup((prev) => ({
      ...prev,
      chores: (prev.chores ?? []).map((c) =>
        c.id === choreId ? completeChore(c) : c
      ),
    }));
  };

  const deleteChore = (choreId: string) => {
    setGroup((prev) => ({
      ...prev,
      chores: (prev.chores ?? []).filter((c) => c.id !== choreId),
    }));
  };

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  // "Today" is the shared board: every chore due today or overdue, so the
  // household can see what still needs doing. "Upcoming" is a personal
  // heads-up: only the chores the current user is handed tomorrow.
  const todayItems = chores
    .filter((c) => c.nextDue <= today)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const upcomingMine = projectOccurrences(chores, tomorrow, tomorrow).filter(
    (o) => o.assigneeId === currentUser.id
  );

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const renderRow = (chore: Chore, accent: string) => {
    const assignee = memberById[chore.assigneeId];
    const isMine = chore.assigneeId === currentUser.id;
    const overdue = choreStatus(chore) === "overdue";
    const upNextId = nextAssigneeId(chore);
    const showUpNext =
      chore.assignMode === "rotation" &&
      chore.everyDays > 0 &&
      upNextId !== chore.assigneeId;
    return (
      <div
        key={chore.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          borderLeft: `3px solid ${accent}`,
        }}
      >
        <div
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
          {chore.icon}
        </div>
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
                index={memberIndex(assignee.id)}
                size={18}
              />
            )}
            <span style={{ fontSize: 13, color: T.tertiary }}>
              {assignee ? (isMine ? "You" : assignee.name) : "Unassigned"} ·{" "}
              {overdue ? (
                <span style={{ color: T.red, fontWeight: 600 }}>
                  Overdue · {formatDate(chore.nextDue)}
                </span>
              ) : (
                formatDate(chore.nextDue)
              )}
            </span>
          </div>
          {showUpNext && memberById[upNextId] && (
            <div style={{ fontSize: 11, color: T.tertiary, marginTop: 2 }}>
              then → {memberById[upNextId].name}
            </div>
          )}
        </div>
        <button
          onClick={() => markDone(chore.id)}
          disabled={!isMine}
          title={isMine ? undefined : "Only the assigned roommate can mark this done"}
          style={{
            padding: "7px 14px",
            borderRadius: 20,
            border: "none",
            background: isMine ? T.green : T.bg,
            color: isMine ? "#fff" : T.tertiary,
            fontFamily: T.font,
            fontSize: 13,
            fontWeight: 600,
            cursor: isMine ? "pointer" : "not-allowed",
          }}
        >
          Done
        </button>
        <button
          onClick={() => deleteChore(chore.id)}
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
  };

  const renderUpcomingRow = (
    occ: ReturnType<typeof projectOccurrences>[number],
    isLast: boolean
  ) => (
    <div
      key={occ.choreId}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderLeft: `3px solid ${T.secondary}`,
        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
      }}
    >
      <div
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
        {occ.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>{occ.name}</div>
        <div style={{ fontSize: 13, color: T.tertiary, marginTop: 4 }}>
          Yours tomorrow · {formatDate(occ.date)}
        </div>
      </div>
    </div>
  );

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
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
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
        <div style={{ ...cardStyle, marginBottom: 20, maxWidth: 560 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "72px 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Icon</label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🧹"
                maxLength={2}
                style={{ ...inputStyle, textAlign: "center" }}
              />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Take out trash"
                style={inputStyle}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Every (days)</label>
              <input
                type="number"
                min={0}
                step="1"
                value={everyDays}
                onChange={(e) => {
                  if (isNonNegativeInput(e.target.value))
                    setEveryDays(e.target.value);
                }}
                onKeyDown={blockNegativeKeys}
                placeholder="2"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>First due</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Assignment</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["fixed", "rotation"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAssignMode(mode)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: T.radiusSm,
                    border: "none",
                    background: assignMode === mode ? T.blue : T.bg,
                    color: assignMode === mode ? "#fff" : T.secondary,
                    fontFamily: T.font,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {mode === "fixed" ? "One person" : "Rotate"}
                </button>
              ))}
            </div>
          </div>

          {assignMode === "fixed" ? (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Assign to</label>
              <select
                value={fixedAssignee}
                onChange={(e) => setFixedAssignee(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {group.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === currentUser.id ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Rotate between (in order, {rotationIds.length} selected)
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {group.members.map((m) => {
                  const selected = rotationIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleRotationMember(m.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: selected ? "rgba(0,122,255,0.1)" : T.bg,
                        border: selected
                          ? `1px solid ${T.blue}`
                          : "1px solid transparent",
                        borderRadius: 20,
                        padding: "4px 10px 4px 4px",
                        cursor: "pointer",
                        fontFamily: T.font,
                      }}
                    >
                      <Avatar
                        name={m.name}
                        index={memberIndex(m.id)}
                        size={22}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: selected ? T.blue : T.text,
                        }}
                      >
                        {m.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={addChore}
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: T.radiusSm,
              border: "none",
              background: canSubmit ? T.blue : "#c7c7cc",
              color: "#fff",
              fontFamily: T.font,
              fontSize: 15,
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "default",
            }}
          >
            Add Chore
          </button>
        </div>
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
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: T.blue,
                  marginBottom: 8,
                  paddingLeft: 4,
                }}
              >
                Today
              </div>
              {todayItems.length === 0 ? (
                <div
                  style={{
                    ...cardStyle,
                    textAlign: "center",
                    color: T.tertiary,
                    fontSize: 14,
                  }}
                >
                  Nothing due today
                </div>
              ) : (
                <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                  {todayItems.map((chore, i) => (
                    <div
                      key={chore.id}
                      style={{
                        borderBottom:
                          i < todayItems.length - 1
                            ? `1px solid ${T.border}`
                            : "none",
                      }}
                    >
                      {renderRow(
                        chore,
                        choreStatus(chore) === "overdue" ? T.red : T.blue
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
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
                Tomorrow · your chores
              </div>
              {upcomingMine.length === 0 ? (
                <div
                  style={{
                    ...cardStyle,
                    textAlign: "center",
                    color: T.tertiary,
                    fontSize: 14,
                  }}
                >
                  No chores assigned to you tomorrow
                </div>
              ) : (
                <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                  {upcomingMine.map((occ, i) =>
                    renderUpcomingRow(occ, i === upcomingMine.length - 1)
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...cardStyle }}>
            <ChoreCalendar
              chores={chores}
              members={group.members}
              currentUser={currentUser}
            />
          </div>
        </div>
      )}
    </div>
  );
}
