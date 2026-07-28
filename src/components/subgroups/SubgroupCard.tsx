"use client";

import { useState } from "react";
import { T, cardStyle, inputStyle, labelStyle } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";
import { evenShare } from "@/lib/splits";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import { stillOpen } from "@/lib/periods";
import type { Roster } from "@/lib/roster";
import type { Member, Subgroup, SubgroupBill } from "@/lib/types";
import Avatar from "@/components/Avatar";
import Checkbox from "@/components/Checkbox";

/** What the card collects; ids and splits are filled in by the tab. */
export interface BillDraft {
  name: string;
  amount: number;
  paidBy: string;
  recurring: boolean;
}

interface SubgroupCardProps {
  subgroup: Subgroup;
  roster: Roster;
  currentUser: Member;
  onToggleMembership: () => void;
  onAddBill: (draft: BillDraft) => void;
  onDeleteBill: (bill: SubgroupBill) => void;
  onDelete: () => void;
}

/** One floor or crew: who's in it, what they share, and what it costs. */
export default function SubgroupCard({
  subgroup,
  roster,
  currentUser,
  onToggleMembership,
  onAddBill,
  onDeleteBill,
  onDelete,
}: SubgroupCardProps) {
  const [adding, setAdding] = useState(false);

  const isMember = subgroup.memberIds.includes(currentUser.id);
  // Bills from a closed month sit in the archive on the Settle tab.
  const bills = stillOpen(subgroup.bills);
  const members = subgroup.memberIds
    .map((id) => roster.byId(id))
    .filter((m): m is Member => Boolean(m));

  return (
    <div style={{ ...cardStyle, padding: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 18px",
          borderBottom:
            bills.length > 0 || isMember ? `1px solid ${T.border}` : "none",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{subgroup.name}</div>
          <div style={{ fontSize: 13, color: T.tertiary }}>
            {countOf(subgroup.memberIds.length)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onToggleMembership}
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
            onClick={onDelete}
            aria-label={`Delete ${subgroup.name}`}
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

      {members.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            padding: "12px 18px 0",
          }}
        >
          {members.map((m) => (
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
                index={roster.indexOf(m.id)}
                size={22}
                src={m.avatarUrl}
              />
              <span style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</span>
            </div>
          ))}
        </div>
      )}

      {bills.length > 0 && (
        <div style={{ padding: "12px 18px 4px" }}>
          {bills.map((b) => (
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
                aria-hidden="true"
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
                  paid by {b.paidByName} ·{" "}
                  {formatMoney(evenShare(b.amount, subgroup.memberIds.length))}
                  /person
                </div>
              </div>
              <div
                style={{ fontFamily: T.mono, fontWeight: 600, fontSize: 14 }}
              >
                {formatMoney(b.amount)}
              </div>
              {isMember && (
                <button
                  onClick={() => onDeleteBill(b)}
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

      {isMember &&
        (adding ? (
          <BillForm
            subgroupId={subgroup.id}
            members={members}
            currentUser={currentUser}
            onAdd={(draft) => {
              onAddBill(draft);
              setAdding(false);
            }}
          />
        ) : (
          <div style={{ padding: "8px 18px 16px" }}>
            <button
              onClick={() => setAdding(true)}
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
        ))}
    </div>
  );
}

function countOf(n: number): string {
  return `${n} ${n === 1 ? "member" : "members"}`;
}

interface BillFormProps {
  /** Only for input ids, which have to be unique across open cards. */
  subgroupId: string;
  members: Member[];
  currentUser: Member;
  onAdd: (draft: BillDraft) => void;
}

function BillForm({ subgroupId, members, currentUser, onAdd }: BillFormProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [payer, setPayer] = useState(currentUser.id);

  const parsed = parseFloat(amount);
  const ready = name.trim() !== "" && !isNaN(parsed) && parsed > 0;

  const submit = () => {
    if (!ready) return;
    onAdd({
      name: name.trim(),
      amount: parsed,
      // Whoever fronted it has to be in the subgroup to be owed by it.
      paidBy: members.some((m) => m.id === payer) ? payer : currentUser.id,
      recurring,
    });
  };

  return (
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
          <label style={labelStyle} htmlFor={`bill-name-${subgroupId}`}>
            Bill
          </label>
          <input
            id={`bill-name-${subgroupId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Toilet paper"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor={`bill-amount-${subgroupId}`}>
            Amount
          </label>
          <input
            id={`bill-amount-${subgroupId}`}
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => {
              if (isNonNegativeInput(e.target.value)) setAmount(e.target.value);
            }}
            onKeyDown={blockNegativeKeys}
            placeholder="0.00"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle} htmlFor={`bill-payer-${subgroupId}`}>
          Paid by
        </label>
        <select
          id={`bill-payer-${subgroupId}`}
          value={payer}
          onChange={(e) => setPayer(e.target.value)}
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

      <div style={{ marginBottom: 14 }}>
        <Checkbox
          checked={recurring}
          onChange={setRecurring}
          label="Recurring monthly"
        />
      </div>

      {ready && (
        <div style={{ fontSize: 13, color: T.secondary, marginBottom: 12 }}>
          {formatMoney(evenShare(parsed, members.length))} per person ·{" "}
          {countOf(members.length)}
        </div>
      )}

      <button
        onClick={submit}
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: T.radiusSm,
          border: "none",
          background: ready ? T.blue : "#c7c7cc",
          color: "#fff",
          fontFamily: T.font,
          fontSize: 15,
          fontWeight: 600,
          cursor: ready ? "pointer" : "default",
        }}
      >
        Add Bill
      </button>
    </div>
  );
}
