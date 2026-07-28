"use client";

import { T, cardStyle } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";
import { calcSettlements } from "@/lib/settlements";
import { completeChore } from "@/lib/chores";
import {
  decidePayment,
  paymentsAwaiting,
  type PaymentDecision,
} from "@/lib/payments";
import { stillOpen } from "@/lib/periods";
import type { Group, Member, Charge } from "@/lib/types";
import NotificationBanner from "@/components/NotificationBanner";
import BalanceHero from "@/components/dashboard/BalanceHero";
import SettlementList from "@/components/dashboard/SettlementList";
import RecentCharges from "@/components/dashboard/RecentCharges";
import ChoreBoard from "@/components/dashboard/ChoreBoard";

interface DashboardTabProps {
  group: Group;
  currentUser: Member;
  allCharges: Charge[];
  setGroup: (updater: (prev: Group) => Group) => void;
  setTab: (tab: string) => void;
}

export default function DashboardTab({
  group,
  currentUser,
  allCharges,
  setGroup,
  setTab,
}: DashboardTabProps) {
  const payments = stillOpen(group.payments);
  const settlements = calcSettlements(
    group.members,
    allCharges,
    group.payments,
    group.smartSettle
  );
  const iOwe = settlements.filter((s) => s.fromId === currentUser.id);
  const owedToMe = settlements.filter((s) => s.toId === currentUser.id);
  const total = (of: typeof iOwe) => of.reduce((sum, s) => sum + s.amount, 0);

  const monthly = allCharges
    .filter((c) => c.recurring)
    .reduce((sum, c) => sum + c.amount, 0);

  const awaitingMe = paymentsAwaiting(group.payments, currentUser.id);
  const decide = (paymentId: string, status: PaymentDecision) =>
    setGroup((prev) => decidePayment(prev, paymentId, status));

  const markChoreDone = (choreId: string) =>
    setGroup((prev) => ({
      ...prev,
      chores: (prev.chores ?? []).map((c) =>
        c.id === choreId ? completeChore(c) : c
      ),
    }));

  return (
    <div>
      <NotificationBanner
        notifications={awaitingMe}
        onAction={decide}
        group={group}
      />
      <div className="dashboard-grid">
        <div>
          <BalanceHero
            owed={total(owedToMe)}
            owing={total(iOwe)}
            onSettleUp={() => setTab("settle")}
          />

          <SettlementList
            title="You Owe"
            settlements={iOwe}
            members={group.members}
            payments={payments}
            direction="out"
          />
          <SettlementList
            title="Owed to You"
            settlements={owedToMe}
            members={group.members}
            payments={payments}
            direction="in"
          />

          {iOwe.length === 0 &&
            owedToMe.length === 0 &&
            awaitingMe.length === 0 && (
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

          {monthly > 0 && (
            <div
              style={{ ...cardStyle, textAlign: "center", marginBottom: 16 }}
            >
              <div
                style={{ fontSize: 13, fontWeight: 500, color: T.secondary }}
              >
                Monthly Recurring
              </div>
              <div
                style={{
                  fontFamily: T.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  marginTop: 4,
                }}
              >
                {formatMoney(monthly)}
              </div>
            </div>
          )}

          <RecentCharges charges={allCharges} />
        </div>

        <ChoreBoard
          chores={group.chores ?? []}
          members={group.members}
          currentUser={currentUser}
          onDone={markChoreDone}
          onViewAll={() => setTab("chores")}
        />
      </div>
    </div>
  );
}
