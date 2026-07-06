"use client";

import { T, cardStyle } from "@/lib/tokens";
import { calcSettlements } from "@/lib/settlements";
import { groupChores, completeChore } from "@/lib/chores";
import type { Group, Member, Charge, Chore } from "@/lib/types";
import Avatar from "@/components/Avatar";
import NotificationBanner from "@/components/NotificationBanner";

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
  const settlements = calcSettlements(
    group.members,
    allCharges,
    group.payments,
    group.smartSettle
  );
  const totalMonthly = allCharges
    .filter((c) => c.recurring)
    .reduce((s, c) => s + c.amount, 0);
  const myNotifications = (group.payments || []).filter(
    (p) => p.toId === currentUser.id && p.status === "pending"
  );
  const handlePaymentAction = (
    paymentId: string,
    status: "confirmed" | "rejected"
  ) => {
    setGroup((prev) => ({
      ...prev,
      payments: prev.payments.map((p) =>
        p.id === paymentId ? { ...p, status } : p
      ),
    }));
  };

  const iOwe = settlements.filter((s) => s.fromId === currentUser.id);
  const owedToMe = settlements.filter((s) => s.toId === currentUser.id);
  const totalIOwe = iOwe.reduce((s, x) => s + x.amount, 0);
  const totalOwedToMe = owedToMe.reduce((s, x) => s + x.amount, 0);
  const netBalance = totalOwedToMe - totalIOwe;

  const chores = group.chores ?? [];
  const memberById: Record<string, Member> = {};
  group.members.forEach((m) => (memberById[m.id] = m));
  const groupedChores = groupChores(chores);

  const markChoreDone = (choreId: string) => {
    setGroup((prev) => ({
      ...prev,
      chores: (prev.chores ?? []).map((c) =>
        c.id === choreId ? completeChore(c) : c
      ),
    }));
  };

  const formatChoreDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const choreSections: {
    key: "overdue" | "today" | "upcoming";
    label: string;
    accent: string;
    items: Chore[];
  }[] = [
    { key: "overdue", label: "Overdue", accent: T.red, items: groupedChores.overdue },
    { key: "today", label: "Today", accent: T.blue, items: groupedChores.today },
    {
      key: "upcoming",
      label: "Upcoming",
      accent: T.secondary,
      items: groupedChores.upcoming,
    },
  ];

  const choresColumn = (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.secondary,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          Chores
        </h3>
        <button
          onClick={() => setTab("chores")}
          style={{
            background: "none",
            border: "none",
            color: T.blue,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font,
            padding: 0,
          }}
        >
          View all
        </button>
      </div>

      {chores.length === 0 ? (
        <div
          style={{
            ...cardStyle,
            textAlign: "center",
            color: T.tertiary,
            fontSize: 14,
            padding: 24,
          }}
        >
          No chores yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {choreSections.map(({ key, label, accent, items }) => {
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: accent,
                    marginBottom: 6,
                    paddingLeft: 2,
                  }}
                >
                  {label}
                </div>
                <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                  {items.map((chore, i) => {
                    const assignee = memberById[chore.assigneeId];
                    const isMine = chore.assigneeId === currentUser.id;
                    return (
                      <div
                        key={chore.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderLeft: `3px solid ${accent}`,
                          borderBottom:
                            i < items.length - 1
                              ? `1px solid ${T.border}`
                              : "none",
                        }}
                      >
                        <div style={{ fontSize: 18 }}>{chore.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              fontSize: 14,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {chore.name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: T.tertiary,
                              marginTop: 1,
                            }}
                          >
                            {assignee
                              ? isMine
                                ? "You"
                                : assignee.name
                              : "Unassigned"}{" "}
                            · {formatChoreDate(chore.nextDue)}
                          </div>
                        </div>
                        <button
                          onClick={() => markChoreDone(chore.id)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 16,
                            border: "none",
                            background: T.green,
                            color: "#fff",
                            fontFamily: T.font,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          Done
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const mainColumn = (
    <div>
      {/* Hero balance */}
      <div
        style={{
          ...cardStyle,
          padding: "28px 24px",
          marginBottom: 16,
          textAlign: "center",
          background:
            netBalance >= 0
              ? "linear-gradient(135deg, rgba(52,199,89,0.08), rgba(0,122,255,0.06))"
              : "linear-gradient(135deg, rgba(255,59,48,0.08), rgba(255,149,0,0.06))",
          border: `1px solid ${
            netBalance >= 0
              ? "rgba(52,199,89,0.15)"
              : "rgba(255,59,48,0.15)"
          }`,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: T.secondary,
            marginBottom: 4,
          }}
        >
          Your Balance
        </div>
        <div
          style={{
            fontFamily: T.mono,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color:
              netBalance > 0.01
                ? T.green
                : netBalance < -0.01
                  ? T.red
                  : T.secondary,
          }}
        >
          {netBalance > 0 ? "+" : netBalance < 0 ? "−" : ""}$
          {Math.abs(netBalance).toFixed(2)}
        </div>
        <div style={{ fontSize: 14, color: T.secondary, marginTop: 4 }}>
          {netBalance > 0.01
            ? "You're owed money"
            : netBalance < -0.01
              ? "You owe money"
              : "All settled up"}
        </div>
        {netBalance < -0.01 && (
          <button
            onClick={() => setTab("settle")}
            style={{
              marginTop: 14,
              background: T.blue,
              color: "#fff",
              border: "none",
              borderRadius: 20,
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: T.font,
              boxShadow: "0 4px 12px rgba(0,122,255,0.3)",
            }}
          >
            Settle Up
          </button>
        )}
      </div>

      {/* Summary row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        <div style={cardStyle}>
          <div
            style={{ fontSize: 13, fontWeight: 500, color: T.secondary }}
          >
            You Owe
          </div>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: 22,
              fontWeight: 700,
              color: totalIOwe > 0 ? T.red : T.tertiary,
              marginTop: 4,
            }}
          >
            ${totalIOwe.toFixed(2)}
          </div>
        </div>
        <div style={cardStyle}>
          <div
            style={{ fontSize: 13, fontWeight: 500, color: T.secondary }}
          >
            Owed to You
          </div>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: 22,
              fontWeight: 700,
              color: totalOwedToMe > 0 ? T.green : T.tertiary,
              marginTop: 4,
            }}
          >
            ${totalOwedToMe.toFixed(2)}
          </div>
        </div>
      </div>

      {/* People you owe */}
      {iOwe.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: T.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            You Owe
          </h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {iOwe.map((s, i) => {
              const toM = group.members.find((m) => m.id === s.toId);
              const toIdx = toM ? group.members.indexOf(toM) : 0;
              const existing = (group.payments || []).find(
                (p) =>
                  p.fromId === s.fromId &&
                  p.toId === s.toId &&
                  (p.status === "pending" || p.status === "confirmed")
              );
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 18px",
                    borderBottom:
                      i < iOwe.length - 1
                        ? `1px solid ${T.border}`
                        : "none",
                  }}
                >
                  <Avatar name={s.toName} index={toIdx} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {s.toName}
                    </div>
                    {toM?.venmo && (
                      <div style={{ fontSize: 13, color: T.tertiary }}>
                        {toM.venmo}
                      </div>
                    )}
                    {existing?.status === "pending" && (
                      <div
                        style={{
                          fontSize: 12,
                          color: T.orange,
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        Waiting for confirmation
                      </div>
                    )}
                    {existing?.status === "confirmed" && (
                      <div
                        style={{
                          fontSize: 12,
                          color: T.green,
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        Confirmed ✓
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: T.mono,
                      fontWeight: 600,
                      fontSize: 17,
                      color: T.red,
                    }}
                  >
                    ${s.amount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Owed to you */}
      {owedToMe.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: T.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            Owed to You
          </h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {owedToMe.map((s, i) => {
              const fromM = group.members.find((m) => m.id === s.fromId);
              const fromIdx = fromM ? group.members.indexOf(fromM) : 0;
              const existing = (group.payments || []).find(
                (p) =>
                  p.fromId === s.fromId &&
                  p.toId === s.toId &&
                  (p.status === "pending" || p.status === "confirmed")
              );
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 18px",
                    borderBottom:
                      i < owedToMe.length - 1
                        ? `1px solid ${T.border}`
                        : "none",
                  }}
                >
                  <Avatar name={s.fromName} index={fromIdx} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {s.fromName}
                    </div>
                    {existing?.status === "pending" && (
                      <div
                        style={{
                          fontSize: 12,
                          color: T.orange,
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        Says they paid
                      </div>
                    )}
                    {existing?.status === "confirmed" && (
                      <div
                        style={{
                          fontSize: 12,
                          color: T.green,
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        Confirmed ✓
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: T.mono,
                      fontWeight: 600,
                      fontSize: 17,
                      color: T.green,
                    }}
                  >
                    ${s.amount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {iOwe.length === 0 &&
        owedToMe.length === 0 &&
        myNotifications.length === 0 && (
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

      {totalMonthly > 0 && (
        <div style={{ ...cardStyle, textAlign: "center", marginBottom: 16 }}>
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
            ${totalMonthly.toFixed(2)}
          </div>
        </div>
      )}

      {allCharges.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: T.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            Recent
          </h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {allCharges
              .slice(-5)
              .reverse()
              .map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 18px",
                    borderBottom:
                      i < Math.min(allCharges.length, 5) - 1
                        ? `1px solid ${T.border}`
                        : "none",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background:
                        c.type === "rent"
                          ? "rgba(255,149,0,0.1)"
                          : c.type === "utility"
                            ? "rgba(0,122,255,0.1)"
                            : c.type === "subgroup"
                              ? "rgba(175,82,222,0.1)"
                              : "rgba(88,86,214,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 17,
                    }}
                  >
                    {c.type === "rent"
                      ? "🏠"
                      : c.type === "utility"
                        ? "⚡"
                        : c.type === "subgroup"
                          ? "🧻"
                          : "🛒"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {c.description}
                      {c.recurring && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: T.blue,
                            fontWeight: 600,
                          }}
                        >
                          Monthly
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.tertiary }}>
                      {c.type === "expense"
                        ? `by ${c.submittedByName}`
                        : c.type === "subgroup"
                          ? `${c.subgroupName} · paid by ${c.submittedByName}`
                          : "Treasurer"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: T.mono,
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    ${c.amount.toFixed(2)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <NotificationBanner
        notifications={myNotifications}
        onAction={handlePaymentAction}
        group={group}
      />
      <div className="dashboard-grid">
        {mainColumn}
        {choresColumn}
      </div>
    </div>
  );
}
