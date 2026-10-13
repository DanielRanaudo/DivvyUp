"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle, cardStyle } from "@/lib/tokens";
import { roster } from "@/lib/roster";
import { uid } from "@/lib/utils";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import { todayISO } from "@/lib/chores";
import type { Chore, Member } from "@/lib/types";
import Avatar from "@/components/Avatar";
import Toggle from "@/components/Toggle";

interface ChoreFormProps {
  members: Member[];
  currentUser: Member;
  /** Present when the treasurer is changing an existing schedule. */
  initialChore?: Chore;
  onSubmit: (chore: Chore) => void;
}

const DEFAULT_ICON = "🧹";

/** The new-chore form: what it is, how often, and whose turn it is. */
export default function ChoreForm({
  members,
  currentUser,
  initialChore,
  onSubmit,
}: ChoreFormProps) {
  const { indexOf } = roster(members);
  const [name, setName] = useState(initialChore?.name ?? "");
  const [icon, setIcon] = useState(initialChore?.icon ?? DEFAULT_ICON);
  const [everyDays, setEveryDays] = useState(
    String(initialChore?.everyDays ?? 2)
  );
  const [startDate, setStartDate] = useState(
    initialChore?.nextDue ?? todayISO()
  );
  const [assignMode, setAssignMode] = useState<"fixed" | "rotation">(
    initialChore?.assignMode ?? "fixed"
  );
  const [smartRotation, setSmartRotation] = useState(
    initialChore ? Boolean(initialChore.smartRotation) : true
  );
  const [fixedAssignee, setFixedAssignee] = useState(
    initialChore?.assigneeId ?? currentUser.id
  );
  const [rotationIds, setRotationIds] = useState<string[]>(
    initialChore?.rotationIds.length
      ? initialChore.rotationIds
      : [initialChore?.assigneeId ?? currentUser.id]
  );

  const canSubmit = Boolean(
    name.trim() &&
    startDate &&
    (assignMode === "fixed" ? fixedAssignee : rotationIds.length > 0)
  );

  const toggleRotationMember = (id: string) =>
    setRotationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const memberIds = members.map((member) => member.id);

  const chooseAssignmentMode = (mode: "fixed" | "rotation") => {
    setAssignMode(mode);
    if (mode === "rotation" && smartRotation) setRotationIds(memberIds);
  };

  const changeSmartRotation = (next: boolean) => {
    setSmartRotation(next);
    setRotationIds(
      next
        ? memberIds
        : [
            members.some((member) => member.id === fixedAssignee)
              ? fixedAssignee
              : currentUser.id,
          ]
    );
  };

  const submit = () => {
    if (!canSubmit) return;
    const days = parseInt(everyDays, 10);
    const assigneeId =
      assignMode === "fixed"
        ? fixedAssignee
        : initialChore && rotationIds.includes(initialChore.assigneeId)
          ? initialChore.assigneeId
          : rotationIds[0];

    onSubmit({
      id: initialChore?.id ?? uid(),
      name: name.trim(),
      icon: icon.trim() || DEFAULT_ICON,
      everyDays: isNaN(days) || days < 0 ? 0 : days,
      nextDue: startDate,
      assignMode,
      smartRotation: assignMode === "rotation" && smartRotation,
      assigneeId,
      rotationIds: assignMode === "rotation" ? rotationIds : [],
      rotationIndex:
        assignMode === "rotation" ? rotationIds.indexOf(assigneeId) : 0,
      // Editing a schedule must not erase its audit trail.
      history: initialChore?.history ?? [],
    });
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 20, maxWidth: 560 }}>
      {initialChore && (
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            margin: "0 0 14px",
          }}
        >
          Editing &ldquo;{initialChore.name}&rdquo;
        </h3>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "72px 1fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="chore-icon">
            Icon
          </label>
          <input
            id="chore-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder={DEFAULT_ICON}
            maxLength={2}
            style={{ ...inputStyle, textAlign: "center" }}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="chore-name">
            Name
          </label>
          <input
            id="chore-name"
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
          <label style={labelStyle} htmlFor="chore-every-days">
            Every (days)
          </label>
          <input
            id="chore-every-days"
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
          <label style={labelStyle} htmlFor="chore-first-due">
            {initialChore ? "Next due" : "First due"}
          </label>
          <input
            id="chore-first-due"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle} id="chore-assignment">
          Assignment
        </div>
        <div
          role="group"
          aria-labelledby="chore-assignment"
          style={{ display: "flex", gap: 8 }}
        >
          {(["fixed", "rotation"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => chooseAssignmentMode(mode)}
              aria-pressed={assignMode === mode}
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
          <label style={labelStyle} htmlFor="chore-assign-to">
            Assign to
          </label>
          <select
            id="chore-assign-to"
            value={fixedAssignee}
            onChange={(e) => setFixedAssignee(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === currentUser.id ? " (you)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "10px 12px",
              marginBottom: 12,
              borderRadius: T.radiusSm,
              background: T.bg,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Smart rotation
              </div>
              <div
                style={{
                  color: T.secondary,
                  fontSize: 12,
                  lineHeight: 1.4,
                  marginTop: 2,
                }}
              >
                Includes everyone, adds future roommates, and balances who
                starts new chores.
              </div>
            </div>
            <Toggle
              checked={smartRotation}
              onChange={changeSmartRotation}
              label="Smart rotation"
            />
          </div>
          <div style={labelStyle} id="chore-rotation">
            {smartRotation
              ? `Everyone (${rotationIds.length} roommates)`
              : `Rotate between (in order, ${rotationIds.length} selected)`}
          </div>
          <div
            role="group"
            aria-labelledby="chore-rotation"
            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            {members.map((m) => {
              const selected = rotationIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  disabled={smartRotation}
                  onClick={() => toggleRotationMember(m.id)}
                  aria-pressed={selected}
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
                    cursor: smartRotation ? "default" : "pointer",
                    fontFamily: T.font,
                  }}
                >
                  <Avatar
                    name={m.name}
                    index={indexOf(m.id)}
                    size={22}
                    src={m.avatarUrl}
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
        onClick={submit}
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
        {initialChore ? "Save Changes" : "Add Chore"}
      </button>
    </div>
  );
}
