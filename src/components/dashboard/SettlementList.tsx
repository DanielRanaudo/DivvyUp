"use client";

import { T, cardStyle, overline } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";
import { payContactLine } from "@/lib/profile";
import { roster } from "@/lib/roster";
import type { Member, Payment, Settlement } from "@/lib/types";
import Avatar from "@/components/Avatar";

interface SettlementListProps {
  title: string;
  settlements: Settlement[];
  members: Member[];
  payments: Payment[];
  /** "out" is money you owe, "in" is money owed to you. */
  direction: "out" | "in";
}

/** The open payment on this pair, if either side has already started it. */
function openPayment(
  payments: Payment[],
  fromId: string,
  toId: string
): Payment | undefined {
  return payments.find(
    (p) =>
      p.fromId === fromId &&
      p.toId === toId &&
      (p.status === "pending" || p.status === "confirmed")
  );
}

/**
 * One side of the ledger: who you owe, or who owes you.
 *
 * Both sides show the same row, so they share one component — the only
 * difference is whose face is on it and what "pending" means from here.
 */
export default function SettlementList({
  title,
  settlements,
  members,
  payments,
  direction,
}: SettlementListProps) {
  if (settlements.length === 0) return null;
  const { byId, indexOf } = roster(members);
  const out = direction === "out";

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={overline}>{title}</h3>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {settlements.map((s, i) => {
          const otherId = out ? s.toId : s.fromId;
          const other = byId(otherId);
          const name = out ? s.toName : s.fromName;
          const existing = openPayment(payments, s.fromId, s.toId);
          const contact = out ? payContactLine(other) : "";

          return (
            <div
              key={`${s.fromId}-${s.toId}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                borderBottom:
                  i < settlements.length - 1 ? `1px solid ${T.border}` : "none",
              }}
            >
              <Avatar
                name={name}
                index={indexOf(otherId)}
                size={40}
                src={other?.avatarUrl}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{name}</div>
                {contact && (
                  <div style={{ fontSize: 13, color: T.tertiary }}>
                    {contact}
                  </div>
                )}
                {existing?.status === "pending" && (
                  <Note color={T.orange}>
                    {out ? "Waiting for confirmation" : "Says they paid"}
                  </Note>
                )}
                {existing?.status === "confirmed" && (
                  <Note color={T.green}>Confirmed ✓</Note>
                )}
              </div>
              <div
                style={{
                  fontFamily: T.mono,
                  fontWeight: 600,
                  fontSize: 17,
                  color: out ? T.red : T.green,
                }}
              >
                {formatMoney(s.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Note({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ fontSize: 12, color, fontWeight: 500, marginTop: 2 }}>
      {children}
    </div>
  );
}
