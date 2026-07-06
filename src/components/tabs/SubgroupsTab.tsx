"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle, cardStyle, secTitle } from "@/lib/tokens";
import { uid } from "@/lib/utils";
import { evenSplit } from "@/lib/splits";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import type { Group, Member } from "@/lib/types";
import Avatar from "@/components/Avatar";

interface SubgroupsTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  currentUser: Member;
}

export default function SubgroupsTab({
  group,
  setGroup,
  currentUser,
}: SubgroupsTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const [billFormFor, setBillFormFor] = useState<string | null>(null);
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billRecurring, setBillRecurring] = useState(false);
  const [billPayer, setBillPayer] = useState(currentUser.id);

  const subgroups = group.subgroups ?? [];
  const memberById: Record<string, Member> = {};
  group.members.forEach((m) => (memberById[m.id] = m));

  const createSubgroup = () => {
    const name = newName.trim();
    if (!name) return;
    setGroup((prev) => ({
      ...prev,
      subgroups: [
        ...(prev.subgroups ?? []),
        {
          id: uid(),
          name,
          memberIds: [currentUser.id],
          bills: [],
        },
      ],
    }));
    setNewName("");
    setShowCreate(false);
  };

  const toggleMembership = (subId: string) => {
    setGroup((prev) => ({
      ...prev,
      subgroups: (prev.subgroups ?? []).map((s) => {
        if (s.id !== subId) return s;
        const isMember = s.memberIds.includes(currentUser.id);
        return {
          ...s,
          memberIds: isMember
            ? s.memberIds.filter((id) => id !== currentUser.id)
            : [...s.memberIds, currentUser.id],
        };
      }),
    }));
  };

  const deleteSubgroup = (subId: string) => {
    setGroup((prev) => ({
      ...prev,
      subgroups: (prev.subgroups ?? []).filter((s) => s.id !== subId),
    }));
  };

  const openBillForm = (subId: string) => {
    setBillFormFor(subId);
    setBillName("");
    setBillAmount("");
    setBillRecurring(false);
    setBillPayer(currentUser.id);
  };

  const addBill = (subId: string) => {
    const amt = parseFloat(billAmount);
    const name = billName.trim();
    if (!name || isNaN(amt) || amt <= 0) return;
    setGroup((prev) => ({
      ...prev,
      subgroups: (prev.subgroups ?? []).map((s) => {
        if (s.id !== subId) return s;
        const payer = s.memberIds.includes(billPayer)
          ? billPayer
          : currentUser.id;
        return {
          ...s,
          bills: [
            ...s.bills,
            {
              id: uid(),
              name,
              amount: amt,
              paidBy: payer,
              paidByName: memberById[payer]?.name ?? "",
              recurring: billRecurring,
              splits: evenSplit(amt, s.memberIds),
              date: new Date().toISOString(),
            },
          ],
        };
      }),
    }));
    setBillFormFor(null);
    setBillName("");
    setBillAmount("");
    setBillRecurring(false);
    setBillPayer(currentUser.id);
  };

  const deleteBill = (subId: string, billId: string) => {
    setGroup((prev) => ({
      ...prev,
      subgroups: (prev.subgroups ?? []).map((s) =>
        s.id === subId
          ? { ...s, bills: s.bills.filter((b) => b.id !== billId) }
          : s
      ),
    }));
  };

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
          <h2 style={{ ...secTitle, marginBottom: 4 }}>Floors</h2>
          <p style={{ fontSize: 14, color: T.secondary, margin: 0 }}>
            Sub-groups with their own shared bills
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            background: showCreate ? T.bg : T.blue,
            color: showCreate ? T.text : "#fff",
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showCreate ? "Cancel" : "+ New"}
        </button>
      </div>

      {showCreate && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <label style={labelStyle}>Subgroup Name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="2nd Floor, Kitchen Crew, etc."
            style={{ ...inputStyle, marginBottom: 14 }}
          />
          <button
            onClick={createSubgroup}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: T.radiusSm,
              border: "none",
              background: newName.trim() ? T.blue : "#c7c7cc",
              color: "#fff",
              fontFamily: T.font,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create Subgroup
          </button>
        </div>
      )}

      {subgroups.length === 0 && !showCreate && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: T.tertiary,
            fontSize: 15,
          }}
        >
          No subgroups yet
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {subgroups.map((sub) => {
          const isMember = sub.memberIds.includes(currentUser.id);
          const payableMembers = sub.memberIds
            .map((id) => memberById[id])
            .filter((m): m is Member => Boolean(m));
          return (
            <div key={sub.id} style={{ ...cardStyle, padding: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "16px 18px",
                  borderBottom:
                    sub.bills.length > 0 || isMember
                      ? `1px solid ${T.border}`
                      : "none",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>
                    {sub.name}
                  </div>
                  <div style={{ fontSize: 13, color: T.tertiary }}>
                    {sub.memberIds.length}{" "}
                    {sub.memberIds.length === 1 ? "member" : "members"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => toggleMembership(sub.id)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 20,
                      border: isMember ? `1px solid ${T.border}` : "none",
                      background: isMember ? "transparent" : T.blue,
                      color: isMember ? T.secondary : "#fff",
                      fontFamily: T.font,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {isMember ? "Leave" : "Join"}
                  </button>
                  <button
                    onClick={() => deleteSubgroup(sub.id)}
                    aria-label={`Delete ${sub.name}`}
                    style={{
                      background: "none",
                      border: "none",
                      color: T.tertiary,
                      cursor: "pointer",
                      fontSize: 20,
                      padding: "0 4px",
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {payableMembers.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    padding: "12px 18px 0",
                  }}
                >
                  {payableMembers.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: T.bg,
                        borderRadius: 20,
                        padding: "4px 10px 4px 4px",
                      }}
                    >
                      <Avatar
                        name={m.name}
                        index={group.members.indexOf(m)}
                        size={22}
                      />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>
                        {m.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {sub.bills.length > 0 && (
                <div style={{ padding: "12px 18px 4px" }}>
                  {sub.bills.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 0",
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: "rgba(175,82,222,0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                        }}
                      >
                        🧻
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>
                          {b.name}
                          {b.recurring && (
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
                          paid by {b.paidByName} · $
                          {(
                            b.amount / Math.max(sub.memberIds.length, 1)
                          ).toFixed(2)}
                          /person
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: T.mono,
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        ${b.amount.toFixed(2)}
                      </div>
                      {isMember && (
                        <button
                          onClick={() => deleteBill(sub.id, b.id)}
                          aria-label={`Delete ${b.name}`}
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
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isMember && billFormFor === sub.id && (
                <div style={{ padding: "8px 18px 18px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Bill</label>
                      <input
                        value={billName}
                        onChange={(e) => setBillName(e.target.value)}
                        placeholder="Toilet paper"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Amount</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={billAmount}
                        onChange={(e) => {
                          if (isNonNegativeInput(e.target.value))
                            setBillAmount(e.target.value);
                        }}
                        onKeyDown={blockNegativeKeys}
                        placeholder="0.00"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Paid by</label>
                    <select
                      value={billPayer}
                      onChange={(e) => setBillPayer(e.target.value)}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      {payableMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.id === currentUser.id ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                      color: T.text,
                      marginBottom: 14,
                    }}
                  >
                    <div
                      onClick={() => setBillRecurring(!billRecurring)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        cursor: "pointer",
                        background: billRecurring ? T.blue : T.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {billRecurring && (
                        <span
                          style={{
                            color: "#fff",
                            fontSize: 15,
                            fontWeight: 700,
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    Recurring monthly
                  </label>
                  {billAmount && parseFloat(billAmount) > 0 && (
                    <div
                      style={{
                        fontSize: 13,
                        color: T.secondary,
                        marginBottom: 12,
                      }}
                    >
                      $
                      {(
                        parseFloat(billAmount) /
                        Math.max(sub.memberIds.length, 1)
                      ).toFixed(2)}{" "}
                      per person · {sub.memberIds.length}{" "}
                      {sub.memberIds.length === 1 ? "member" : "members"}
                    </div>
                  )}
                  <button
                    onClick={() => addBill(sub.id)}
                    style={{
                      width: "100%",
                      padding: "12px 0",
                      borderRadius: T.radiusSm,
                      border: "none",
                      background:
                        billName.trim() && billAmount ? T.blue : "#c7c7cc",
                      color: "#fff",
                      fontFamily: T.font,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Add Bill
                  </button>
                </div>
              )}

              {isMember && billFormFor !== sub.id && (
                <div style={{ padding: "8px 18px 16px" }}>
                  <button
                    onClick={() => openBillForm(sub.id)}
                    style={{
                      width: "100%",
                      padding: "10px 0",
                      borderRadius: T.radiusSm,
                      border: `1px solid ${T.border}`,
                      background: "transparent",
                      color: T.blue,
                      fontFamily: T.font,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + Add Bill
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
