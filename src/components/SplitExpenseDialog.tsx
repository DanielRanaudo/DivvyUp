"use client";

import { useMemo, useState } from "react";
import { T, inputStyle } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import {
  buildSplits,
  emptyDraft,
  splitProblem,
  splitTotal,
  type SplitDraft,
} from "@/lib/expenseSplits";
import { evenSplit } from "@/lib/splits";
import type { Expense, Member, SplitMode } from "@/lib/types";
import Modal from "@/components/Modal";
import Checkbox from "@/components/Checkbox";

interface SplitExpenseDialogProps {
  /** The expense being approved; null keeps the dialog closed. */
  expense: Expense | null;
  members: Member[];
  /** Starting point, so reopening an expense keeps the earlier choice. */
  initialDraft?: SplitDraft;
  onCancel: () => void;
  onApprove: (splits: Record<string, number>, mode: SplitMode) => void;
}

const MODES: { id: SplitMode; label: string }[] = [
  { id: "even", label: "Evenly" },
  { id: "subset", label: "Some of us" },
  { id: "exact", label: "Amounts" },
  { id: "percentage", label: "Percent" },
];

export default function SplitExpenseDialog({
  expense,
  members,
  initialDraft,
  onCancel,
  onApprove,
}: SplitExpenseDialogProps) {
  const allIds = useMemo(() => members.map((m) => m.id), [members]);
  // The caller keys this component on the expense id, so each expense gets a
  // fresh draft without any state to reset.
  const [draft, setDraft] = useState<SplitDraft>(
    () => initialDraft ?? emptyDraft(allIds)
  );

  const amount = expense?.amount ?? 0;
  const splits = buildSplits(draft, amount, allIds);
  const problem = splitProblem(draft, amount, allIds);
  const assigned = splitTotal(splits);

  const setMode = (mode: SplitMode) => setDraft((d) => ({ ...d, mode }));

  const toggleMember = (id: string, included: boolean) =>
    setDraft((d) => ({
      ...d,
      includedIds: included
        ? [...d.includedIds, id]
        : d.includedIds.filter((x) => x !== id),
    }));

  const setEntry = (id: string, value: string) =>
    setDraft((d) => ({ ...d, entries: { ...d.entries, [id]: value } }));

  // A starting point for the two typed modes: everyone equal, which is usually
  // a couple of edits away from what the treasurer wants.
  const prefillEvenly = () => {
    const even = evenSplit(amount, allIds);
    setDraft((d) => ({
      ...d,
      entries: Object.fromEntries(
        allIds.map((id) => [
          id,
          d.mode === "percentage"
            ? (100 / allIds.length).toFixed(2)
            : (even[id] ?? 0).toFixed(2),
        ])
      ),
    }));
  };

  return (
    <Modal
      open={expense !== null}
      onClose={onCancel}
      title={expense ? `Split "${expense.description}"` : "Split expense"}
    >
      <p style={{ fontSize: 14, color: T.secondary, margin: "0 0 16px" }}>
        {formatMoney(amount)} submitted by {expense?.submittedByName}
      </p>

      <div
        role="group"
        aria-label="How to split"
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: T.bg,
          borderRadius: T.radiusSm,
          marginBottom: 16,
        }}
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            aria-pressed={draft.mode === m.id}
            style={{
              flex: 1,
              padding: "8px 4px",
              border: "none",
              borderRadius: 8,
              background: draft.mode === m.id ? T.cardSolid : "transparent",
              color: draft.mode === m.id ? T.text : T.secondary,
              fontFamily: T.font,
              fontSize: 13,
              fontWeight: draft.mode === m.id ? 600 : 500,
              cursor: "pointer",
              boxShadow:
                draft.mode === m.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 16 }}>
        {members.map((m) => {
          const share = splits[m.id] ?? 0;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 0",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {draft.mode === "subset" ? (
                  <Checkbox
                    checked={draft.includedIds.includes(m.id)}
                    onChange={(next) => toggleMember(m.id, next)}
                    label={m.name}
                  />
                ) : (
                  <span style={{ fontSize: 14 }}>{m.name}</span>
                )}
              </div>

              {draft.mode === "exact" || draft.mode === "percentage" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {draft.mode === "exact" && (
                    <span style={{ color: T.tertiary, fontSize: 14 }}>$</span>
                  )}
                  <input
                    type="number"
                    min={0}
                    step={draft.mode === "exact" ? "0.01" : "0.1"}
                    value={draft.entries[m.id] ?? ""}
                    onChange={(e) => {
                      if (isNonNegativeInput(e.target.value))
                        setEntry(m.id, e.target.value);
                    }}
                    onKeyDown={blockNegativeKeys}
                    aria-label={
                      draft.mode === "exact"
                        ? `Amount for ${m.name}`
                        : `Percentage for ${m.name}`
                    }
                    placeholder="0"
                    style={{
                      ...inputStyle,
                      width: 88,
                      padding: "8px 10px",
                      textAlign: "right",
                      fontFamily: T.mono,
                      fontSize: 14,
                    }}
                  />
                  {draft.mode === "percentage" && (
                    <span style={{ color: T.tertiary, fontSize: 14 }}>%</span>
                  )}
                </div>
              ) : null}

              <div
                style={{
                  fontFamily: T.mono,
                  fontSize: 14,
                  fontWeight: 600,
                  color: share > 0 ? T.text : T.tertiary,
                  minWidth: 72,
                  textAlign: "right",
                }}
              >
                {formatMoney(share)}
              </div>
            </div>
          );
        })}
      </div>

      {(draft.mode === "exact" || draft.mode === "percentage") && (
        <button
          onClick={prefillEvenly}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            marginBottom: 12,
            color: T.blue,
            fontFamily: T.font,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Fill in an even split
        </button>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontSize: 14,
          marginBottom: 4,
        }}
      >
        <span style={{ color: T.secondary }}>Assigned</span>
        <span
          style={{
            fontFamily: T.mono,
            fontWeight: 600,
            color: problem ? T.orange : T.green,
          }}
        >
          {formatMoney(assigned)} of {formatMoney(amount)}
        </span>
      </div>

      <div
        role="status"
        style={{
          minHeight: 20,
          fontSize: 13,
          color: problem ? T.orange : T.green,
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        {problem ?? "Adds up — ready to approve."}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: T.radiusSm,
            border: "none",
            background: T.bg,
            color: T.text,
            fontFamily: T.font,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => !problem && onApprove(splits, draft.mode)}
          disabled={!!problem}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: T.radiusSm,
            border: "none",
            background: problem ? "#c7c7cc" : T.green,
            color: "#fff",
            fontFamily: T.font,
            fontSize: 15,
            fontWeight: 600,
            cursor: problem ? "default" : "pointer",
          }}
        >
          Approve
        </button>
      </div>
    </Modal>
  );
}
