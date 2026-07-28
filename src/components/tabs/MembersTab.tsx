"use client";

import { useMemo, useState } from "react";
import { T, cardStyle, secTitle } from "@/lib/tokens";
import { payContactLine } from "@/lib/profile";
import type { Group, Member, Charge } from "@/lib/types";
import { calcSimpleSettlements, calcSmartSettlements } from "@/lib/settlements";
import { canRemoveMember, removeMember } from "@/lib/members";
import Avatar from "@/components/Avatar";
import Toggle from "@/components/Toggle";
import ConfirmDialog from "@/components/ConfirmDialog";

interface MembersTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  currentUser: Member;
  isTreasurer: boolean;
  allCharges: Charge[];
}

export default function MembersTab({
  group,
  setGroup,
  currentUser,
  isTreasurer,
  allCharges,
}: MembersTabProps) {
  const simpleCount = calcSimpleSettlements(
    group.members,
    allCharges,
    group.payments
  ).length;
  const smartCount = calcSmartSettlements(
    group.members,
    allCharges,
    group.payments
  ).length;
  const paymentsSaved = simpleCount - smartCount;
  const [copied, setCopied] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const copyCode = () => {
    navigator.clipboard?.writeText(group.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const removalTarget = group.members.find((m) => m.id === pendingRemoval);
  const transferTarget = group.members.find((m) => m.id === pendingTransfer);

  // Previewing the removal shows the treasurer exactly what it will change
  // before they commit — re-split rent, reassigned chores, and so on.
  const removalPreview = useMemo(
    () => (pendingRemoval ? removeMember(group, pendingRemoval).notes : []),
    [group, pendingRemoval]
  );

  const startRemoval = (id: string) => {
    const check = canRemoveMember(group, id, allCharges);
    if (!check.ok) {
      setBlocked(check.reason ?? "That person can't be removed right now.");
      return;
    }
    setPendingRemoval(id);
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    // Re-check at the moment of action: balances may have moved while the
    // dialog sat open, and a realtime update may have changed the group.
    const check = canRemoveMember(group, pendingRemoval, allCharges);
    if (!check.ok) {
      setPendingRemoval(null);
      setBlocked(check.reason ?? "That person can't be removed right now.");
      return;
    }
    const name = removalTarget?.name ?? "They";
    const { notes } = removeMember(group, pendingRemoval);
    setGroup((prev) => removeMember(prev, pendingRemoval).group);
    setPendingRemoval(null);
    setNotice(
      notes.length > 0
        ? `${name} was removed. ${notes.join(" ")}`
        : `${name} was removed.`
    );
  };

  const confirmTransfer = () => {
    if (!pendingTransfer) return;
    const name = transferTarget?.name ?? "They";
    setGroup((prev) => ({
      ...prev,
      members: prev.members.map((m) => ({
        ...m,
        isTreasurer: m.id === pendingTransfer,
      })),
    }));
    setPendingTransfer(null);
    setNotice(`${name} is now the treasurer.`);
  };

  return (
    <div>
      <h2 style={secTitle}>Members</h2>

      {(notice || blocked) && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: T.radiusSm,
            fontSize: 14,
            lineHeight: 1.5,
            background: blocked
              ? "rgba(255,59,48,0.08)"
              : "rgba(52,199,89,0.1)",
            color: blocked ? T.red : T.text,
          }}
        >
          {blocked ?? notice}
          <button
            onClick={() => {
              setNotice(null);
              setBlocked(null);
            }}
            aria-label="Dismiss message"
            style={{
              float: "right",
              background: "none",
              border: "none",
              color: "inherit",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      <div
        style={{
          ...cardStyle,
          marginBottom: 24,
          textAlign: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: T.secondary,
            marginBottom: 8,
          }}
        >
          Invite Code
        </div>
        <div
          style={{
            fontFamily: T.mono,
            fontSize: "clamp(20px, 7vw, 30px)",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: T.text,
            overflowWrap: "anywhere",
          }}
        >
          {group.code}
        </div>
        <button
          onClick={copyCode}
          style={{
            marginTop: 12,
            padding: "8px 20px",
            borderRadius: 20,
            border: "none",
            background: copied ? T.green : T.bg,
            color: copied ? "#fff" : T.text,
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {copied ? "Copied!" : "Copy Code"}
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {group.members.map((m, i) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 18px",
              borderBottom:
                i < group.members.length - 1 ? `1px solid ${T.border}` : "none",
            }}
          >
            <Avatar name={m.name} index={i} size={40} src={m.avatarUrl} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {m.name}
                {m.isTreasurer && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: T.orange,
                      fontWeight: 600,
                    }}
                  >
                    Treasurer
                  </span>
                )}
                {m.id === currentUser.id && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: T.purple,
                      fontWeight: 600,
                    }}
                  >
                    You
                  </span>
                )}
              </div>
              {payContactLine(m) && (
                <div style={{ fontSize: 13, color: T.tertiary }}>
                  {payContactLine(m)}
                </div>
              )}
            </div>
            {isTreasurer && !m.isTreasurer && m.id !== currentUser.id && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setPendingTransfer(m.id)}
                  aria-label={`Make ${m.name} treasurer`}
                  style={{
                    background: "none",
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: T.tertiary,
                    cursor: "pointer",
                    fontFamily: T.font,
                  }}
                >
                  Make treasurer
                </button>
                <button
                  onClick={() => startRemoval(m.id)}
                  aria-label={`Remove ${m.name} from the group`}
                  style={{
                    background: "none",
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: T.tertiary,
                    cursor: "pointer",
                    fontFamily: T.font,
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Remove ${removalTarget?.name ?? "member"}?`}
        message={`${
          removalTarget?.name ?? "They"
        } is settled up, so removing them won't change anyone else's balance. Approved expenses and payment history stay on record.`}
        details={removalPreview}
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />

      <ConfirmDialog
        open={pendingTransfer !== null}
        title={`Make ${transferTarget?.name ?? "member"} treasurer?`}
        message={`${
          transferTarget?.name ?? "They"
        } will be able to set rent, add bills, and approve expenses. You'll lose those abilities.`}
        confirmLabel="Hand over"
        onConfirm={confirmTransfer}
        onCancel={() => setPendingTransfer(null)}
      />

      {isTreasurer && (
        <div style={{ marginTop: 32 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: T.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 12,
            }}
          >
            Settings
          </h3>
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "start",
                gap: 14,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 16,
                    marginBottom: 4,
                  }}
                >
                  Smart Balance
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: T.secondary,
                    lineHeight: 1.6,
                  }}
                >
                  {group.smartSettle
                    ? "Debts are optimized across the group to minimize total payments. Fewer Venmo requests, less hassle for everyone."
                    : "Each expense creates a direct debt to whoever paid. Easier to trace where each charge comes from."}
                </div>
                {!group.smartSettle && paymentsSaved > 0 && (
                  <div
                    style={{
                      fontSize: 13,
                      color: T.blue,
                      marginTop: 8,
                      fontWeight: 500,
                    }}
                  >
                    Turning this on would cut settle-up from {simpleCount}{" "}
                    payment
                    {simpleCount === 1 ? "" : "s"} to {smartCount} payment
                    {smartCount === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 2 }}>
                <Toggle
                  checked={group.smartSettle}
                  onChange={(next) =>
                    setGroup((prev) => ({ ...prev, smartSettle: next }))
                  }
                  label="Smart Balance"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
