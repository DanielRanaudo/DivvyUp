"use client";

import { useState } from "react";
import { T, cardStyle, secTitle } from "@/lib/tokens";
import type { Group, Member, Charge } from "@/lib/types";
import {
  calcSimpleSettlements,
  calcSmartSettlements,
} from "@/lib/settlements";
import Avatar from "@/components/Avatar";

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
  const [confirmKick, setConfirmKick] = useState<string | null>(null);

  const copyCode = () => {
    navigator.clipboard?.writeText(group.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const kickMember = (id: string) => {
    setGroup((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== id),
      expenses: prev.expenses.filter((e) => e.submittedBy !== id),
      subgroups: (prev.subgroups ?? []).map((s) => ({
        ...s,
        memberIds: s.memberIds.filter((mid) => mid !== id),
      })),
    }));
    setConfirmKick(null);
  };

  return (
    <div>
      <h2 style={secTitle}>Members</h2>

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
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: T.text,
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
                i < group.members.length - 1
                  ? `1px solid ${T.border}`
                  : "none",
              background:
                confirmKick === m.id
                  ? "rgba(255,59,48,0.04)"
                  : "transparent",
            }}
          >
            <Avatar name={m.name} index={i} size={40} />
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
              {m.venmo && (
                <div style={{ fontSize: 13, color: T.tertiary }}>
                  {m.venmo}
                </div>
              )}
            </div>
            {isTreasurer &&
              !m.isTreasurer &&
              m.id !== currentUser.id &&
              (confirmKick === m.id ? (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() => kickMember(m.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: T.red,
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => setConfirmKick(null)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: T.bg,
                      color: T.secondary,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmKick(m.id)}
                  style={{
                    background: "none",
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: T.tertiary,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              ))}
          </div>
        ))}
      </div>

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
                    Turning this on would cut settle-up from {simpleCount} payment
                    {simpleCount === 1 ? "" : "s"} to {smartCount} payment
                    {smartCount === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              <button
                onClick={() =>
                  setGroup((prev) => ({
                    ...prev,
                    smartSettle: !prev.smartSettle,
                  }))
                }
                style={{
                  width: 52,
                  height: 32,
                  borderRadius: 16,
                  border: "none",
                  cursor: "pointer",
                  background: group.smartSettle
                    ? T.green
                    : "rgba(0,0,0,0.1)",
                  position: "relative",
                  transition: "background 0.3s",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    background: "#fff",
                    position: "absolute",
                    top: 3,
                    left: group.smartSettle ? 23 : 3,
                    transition:
                      "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
