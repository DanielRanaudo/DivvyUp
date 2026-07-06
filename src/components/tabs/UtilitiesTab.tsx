"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle, cardStyle, secTitle } from "@/lib/tokens";
import { uid } from "@/lib/utils";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import type { Group } from "@/lib/types";

interface UtilitiesTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
}

export default function UtilitiesTab({ group, setGroup }: UtilitiesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(true);

  const addUtility = () => {
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt) || amt <= 0) return;
    const splits: Record<string, number> = {};
    const share = amt / group.members.length;
    group.members.forEach(
      (m) => (splits[m.id] = Math.round(share * 100) / 100)
    );
    setGroup((prev) => ({
      ...prev,
      utilities: [
        ...prev.utilities,
        {
          id: uid(),
          name: name.trim(),
          amount: amt,
          recurring,
          splits,
          date: new Date().toISOString(),
        },
      ],
    }));
    setName("");
    setAmount("");
    setRecurring(true);
    setShowForm(false);
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
          <h2 style={{ ...secTitle, marginBottom: 4 }}>Utilities</h2>
          <p style={{ fontSize: 14, color: T.secondary, margin: 0 }}>
            Split evenly among all members
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            background: showForm ? T.bg : T.blue,
            color: showForm ? T.text : "#fff",
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Electric"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Amount</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => {
                  if (isNonNegativeInput(e.target.value))
                    setAmount(e.target.value);
                }}
                onKeyDown={blockNegativeKeys}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          </div>
          {amount && parseFloat(amount) > 0 && (
            <div
              style={{
                fontSize: 13,
                color: T.secondary,
                marginBottom: 12,
              }}
            >
              ${(parseFloat(amount) / group.members.length).toFixed(2)} per
              person
            </div>
          )}
          <button
            onClick={addUtility}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: T.radiusSm,
              border: "none",
              background: name.trim() && amount ? T.blue : "#c7c7cc",
              color: "#fff",
              fontFamily: T.font,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Add Utility
          </button>
        </div>
      )}

      {group.utilities.length === 0 && !showForm && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: T.tertiary,
            fontSize: 15,
          }}
        >
          No utilities yet
        </div>
      )}

      {group.utilities.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          {group.utilities.map((u, i) => (
            <div
              key={u.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderBottom:
                  i < group.utilities.length - 1
                    ? `1px solid ${T.border}`
                    : "none",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(0,122,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                }}
              >
                ⚡
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  {u.name}
                  {u.recurring && (
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
                <div style={{ fontSize: 13, color: T.tertiary }}>
                  ${(u.amount / group.members.length).toFixed(2)} per
                  person
                </div>
              </div>
              <div
                style={{
                  fontFamily: T.mono,
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                ${u.amount.toFixed(2)}
              </div>
              <button
                onClick={() =>
                  setGroup((prev) => ({
                    ...prev,
                    utilities: prev.utilities.filter(
                      (x) => x.id !== u.id
                    ),
                  }))
                }
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
