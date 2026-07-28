"use client";

import { useState } from "react";
import { T, cardStyle, secTitle } from "@/lib/tokens";
import { roster } from "@/lib/roster";
import { USE_BACKEND } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { stillOpen } from "@/lib/periods";
import { useTruncatedList } from "@/hooks/useTruncatedList";
import { payContactLine } from "@/lib/profile";
import { calcSettlements } from "@/lib/settlements";
import {
  decidePayment,
  paymentsAwaiting,
  type PaymentDecision,
} from "@/lib/payments";
import { formatDate, formatMoney } from "@/lib/format";
import { uid } from "@/lib/utils";
import type { Group, Member, Charge, Settlement } from "@/lib/types";
import Avatar from "@/components/Avatar";
import NotificationBanner from "@/components/NotificationBanner";
import ShowMoreRow from "@/components/ShowMoreRow";
import ExportCsvButton from "@/components/ExportCsvButton";
import CloseMonthCard from "@/components/periods/CloseMonthCard";
import PeriodArchive from "@/components/periods/PeriodArchive";

const SECTION_HEADING = {
  fontSize: 13,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: 10,
};

interface SettleTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  allCharges: Charge[];
  currentUser: Member;
  isTreasurer: boolean;
  /** Resolves to an error message, or null when the month closed. */
  onCloseMonth: () => Promise<string | null>;
}

export default function SettleTab({
  group,
  setGroup,
  allCharges,
  currentUser,
  isTreasurer,
  onCloseMonth,
}: SettleTabProps) {
  const [supabase] = useState(() =>
    USE_BACKEND && typeof window !== "undefined" ? createClient() : null
  );
  const settlements = calcSettlements(
    group.members,
    allCharges,
    group.payments,
    group.smartSettle
  );
  const { byId: memberById, indexOf: memberIndex } = roster(group.members);
  const payments = stillOpen(group.payments);

  const getPaymentStatus = (fromId: string, toId: string) =>
    payments.find(
      (p) =>
        p.fromId === fromId &&
        p.toId === toId &&
        (p.status === "pending" || p.status === "confirmed")
    ) || null;

  // Confirming used to live only on the dashboard banner, which is easy to miss
  // when you came here to chase what you're owed.
  const awaitingMe = paymentsAwaiting(payments, currentUser.id);
  const decide = (paymentId: string, decision: PaymentDecision) =>
    setGroup((prev) => decidePayment(prev, paymentId, decision));

  // Answered payments, newest first, a screenful at a time.
  const history = useTruncatedList(
    payments.filter((p) => p.status !== "pending").reverse()
  );

  const markAsPaid = (
    fromId: string,
    fromName: string,
    toId: string,
    toName: string,
    amount: number
  ) => {
    setGroup((prev) => ({
      ...prev,
      payments: [
        ...(prev.payments || []),
        {
          id: uid(),
          fromId,
          fromName,
          toId,
          toName,
          amount,
          status: "pending" as const,
          date: new Date().toISOString(),
        },
      ],
    }));
  };

  const myDebts = settlements.filter((s) => s.fromId === currentUser.id);
  const owedToMe = settlements.filter((s) => s.toId === currentUser.id);
  const otherSettlements = settlements.filter(
    (s) => s.fromId !== currentUser.id && s.toId !== currentUser.id
  );

  const renderSettlement = (s: Settlement, i: number, showAction: boolean) => {
    const fromM = memberById(s.fromId);
    const existing = getPaymentStatus(s.fromId, s.toId);
    const toM = memberById(s.toId);
    return (
      <div
        key={`${s.fromId}-${s.toId}-${i}`}
        style={{
          padding: "16px 18px",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar
            name={s.fromName}
            index={memberIndex(s.fromId)}
            size={36}
            src={fromM?.avatarUrl}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15 }}>
              <span style={{ fontWeight: 600 }}>
                {s.fromName}
                {s.fromId === currentUser.id ? " (you)" : ""}
              </span>
              <span style={{ color: T.tertiary }}> → </span>
              <span style={{ fontWeight: 600 }}>
                {s.toName}
                {s.toId === currentUser.id ? " (you)" : ""}
              </span>
            </div>
            {payContactLine(toM) && (
              <div
                style={{
                  fontSize: 13,
                  color: T.tertiary,
                  marginTop: 2,
                }}
              >
                {payContactLine(toM)}
              </div>
            )}
          </div>
          <div
            style={{
              fontFamily: T.mono,
              fontWeight: 700,
              fontSize: 17,
              color: existing?.status === "confirmed" ? T.green : T.red,
            }}
          >
            {formatMoney(s.amount)}
          </div>
        </div>
        {existing?.status === "confirmed" && (
          <div
            style={{
              fontSize: 13,
              color: T.green,
              fontWeight: 500,
              marginTop: 8,
              marginLeft: 48,
            }}
          >
            ✓ Confirmed {formatDate(existing.date)}
          </div>
        )}
        {existing?.status === "pending" && (
          <div
            style={{
              fontSize: 13,
              color: T.orange,
              fontWeight: 500,
              marginTop: 8,
              marginLeft: 48,
            }}
          >
            Waiting for {s.toName} to confirm · sent {formatDate(existing.date)}
          </div>
        )}
        {!existing && showAction && s.fromId === currentUser.id && (
          <div style={{ marginTop: 10, marginLeft: 48 }}>
            <button
              onClick={() =>
                markAsPaid(s.fromId, s.fromName, s.toId, s.toName, s.amount)
              }
              style={{
                padding: "8px 20px",
                borderRadius: 20,
                border: "none",
                background: T.blue,
                color: "#fff",
                fontFamily: T.font,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,122,255,0.25)",
              }}
            >
              I Paid This
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 style={secTitle}>Settle Up</h2>
      <p
        style={{
          fontSize: 15,
          color: T.secondary,
          marginTop: -12,
          marginBottom: 24,
        }}
      >
        Pay who you owe, then mark it paid.
      </p>
      {awaitingMe.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <h3 style={{ ...SECTION_HEADING, color: T.orange }}>
            Waiting on You
          </h3>
          <NotificationBanner
            notifications={awaitingMe}
            onAction={decide}
            group={group}
          />
        </div>
      )}

      {settlements.length === 0 && awaitingMe.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: T.tertiary,
            fontSize: 15,
          }}
        >
          All settled up ✨
        </div>
      )}

      {myDebts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ ...SECTION_HEADING, color: T.red }}>You Owe</h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {myDebts.map((s, i) => renderSettlement(s, i, true))}
          </div>
        </div>
      )}
      {owedToMe.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ ...SECTION_HEADING, color: T.green }}>Owed to You</h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {owedToMe.map((s, i) => renderSettlement(s, i, false))}
          </div>
        </div>
      )}
      {otherSettlements.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ ...SECTION_HEADING, color: T.tertiary }}>Others</h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {otherSettlements.map((s, i) => renderSettlement(s, i, false))}
          </div>
        </div>
      )}

      {history.visible.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h3 style={{ ...SECTION_HEADING, color: T.tertiary }}>History</h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {history.visible.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 18px",
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 16 }}>
                  {p.status === "confirmed" ? "✅" : "❌"}
                </span>
                <div style={{ flex: 1, fontSize: 14 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.fromName}</span>
                    <span style={{ color: T.tertiary }}> → </span>
                    <span style={{ fontWeight: 600 }}>{p.toName}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.tertiary }}>
                    {p.status === "confirmed" ? "Confirmed" : "Denied"} ·{" "}
                    {formatDate(p.date)}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {formatMoney(p.amount)}
                </span>
              </div>
            ))}
            <ShowMoreRow
              hidden={history.hidden}
              label="payments"
              onClick={history.showMore}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <ExportCsvButton
          group={group}
          range={async () => ({
            period: null,
            expenses: stillOpen(group.expenses),
            payments,
          })}
          label="Export this month"
        />
      </div>

      {isTreasurer && (
        <CloseMonthCard
          group={group}
          allCharges={allCharges}
          onClose={onCloseMonth}
        />
      )}

      <PeriodArchive
        group={group}
        supabase={supabase}
        periods={group.periods ?? []}
      />
    </div>
  );
}
