"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle, cardStyle, secTitle } from "@/lib/tokens";
import { uid } from "@/lib/utils";
import { evenShare } from "@/lib/splits";
import { formatMoney } from "@/lib/format";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import type { Group } from "@/lib/types";
import Avatar from "@/components/Avatar";
import Checkbox from "@/components/Checkbox";

interface RentTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
}

export default function RentTab({ group, setGroup }: RentTabProps) {
  const [amount, setAmount] = useState(
    group.rent?.amount ? String(group.rent.amount) : ""
  );
  const [splitType, setSplitType] = useState<"equal" | "percentage" | "custom">(
    group.rent?.splitType || "equal"
  );
  const [recurring, setRecurring] = useState(group.rent?.recurring ?? true);
  const [percentages, setPercentages] = useState<Record<string, string>>(
    group.rent?.percentages || {}
  );
  const [customs, setCustoms] = useState<Record<string, string>>(
    group.rent?.customs || {}
  );
  const [saved, setSaved] = useState(false);
  const amt = parseFloat(amount) || 0;
  const pctTotal = Object.values(percentages).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );
  const customTotal = Object.values(customs).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );

  const handleSave = () => {
    if (!amt) return;
    const splits: Record<string, number> = {};
    if (splitType === "equal") {
      const share = amt / group.members.length;
      group.members.forEach(
        (m) => (splits[m.id] = Math.round(share * 100) / 100)
      );
    } else if (splitType === "percentage") {
      group.members.forEach(
        (m) =>
          (splits[m.id] =
            Math.round(
              ((amt * (parseFloat(percentages[m.id]) || 0)) / 100) * 100
            ) / 100)
      );
    } else {
      group.members.forEach(
        (m) =>
          (splits[m.id] =
            Math.round((parseFloat(customs[m.id]) || 0) * 100) / 100)
      );
    }
    setGroup((prev) => ({
      ...prev,
      rent: {
        amount: amt,
        splitType,
        recurring,
        percentages,
        customs,
        splits,
        id: prev.rent?.id || uid(),
      },
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 style={secTitle}>Rent</h2>
      <p
        style={{
          fontSize: 15,
          color: T.secondary,
          marginTop: -12,
          marginBottom: 24,
        }}
      >
        Set the household rent and how it&apos;s divided.
      </p>

      <div style={cardStyle}>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle} htmlFor="rent-total-monthly-rent">
            Total Monthly Rent
          </label>
          <input
            id="rent-total-monthly-rent"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => {
              if (isNonNegativeInput(e.target.value)) setAmount(e.target.value);
            }}
            onKeyDown={blockNegativeKeys}
            placeholder="0.00"
            style={{
              ...inputStyle,
              fontFamily: T.mono,
              fontSize: 28,
              fontWeight: 700,
              textAlign: "center",
              padding: "16px 14px",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={labelStyle} id="rent-split-method">
            Split Method
          </div>
          <div
            role="group"
            aria-labelledby="rent-split-method"
            style={{
              display: "flex",
              gap: 4,
              background: T.bg,
              borderRadius: 10,
              padding: 3,
            }}
          >
            {(
              [
                ["equal", "Even"],
                ["percentage", "By %"],
                ["custom", "Custom"],
              ] as const
            ).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setSplitType(val)}
                aria-pressed={splitType === val}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 8,
                  border: "none",
                  background: splitType === val ? T.cardSolid : "transparent",
                  color: splitType === val ? T.text : T.secondary,
                  fontFamily: T.font,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow:
                    splitType === val ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {splitType === "equal" && amt > 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "16px 0",
              marginBottom: 8,
              background: T.bg,
              borderRadius: T.radiusSm,
            }}
          >
            <div
              style={{
                fontFamily: T.mono,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {formatMoney(evenShare(amt, group.members.length))}
            </div>
            <div style={{ fontSize: 13, color: T.secondary, marginTop: 4 }}>
              per person · {group.members.length} roommates
            </div>
          </div>
        )}

        {splitType === "percentage" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 8,
            }}
          >
            {group.members.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Avatar name={m.name} index={i} size={28} src={m.avatarUrl} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                  {m.name}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={percentages[m.id] || ""}
                  onChange={(e) => {
                    if (isNonNegativeInput(e.target.value))
                      setPercentages((p) => ({
                        ...p,
                        [m.id]: e.target.value,
                      }));
                  }}
                  onKeyDown={blockNegativeKeys}
                  placeholder="0"
                  style={{
                    ...inputStyle,
                    width: 64,
                    textAlign: "right",
                    padding: "8px 10px",
                  }}
                />
                <span style={{ fontSize: 14, color: T.secondary, width: 16 }}>
                  %
                </span>
                {amt > 0 && (
                  <span
                    style={{
                      fontFamily: T.mono,
                      fontSize: 13,
                      color: T.tertiary,
                      width: 70,
                      textAlign: "right",
                    }}
                  >
                    $
                    {(
                      (amt * (parseFloat(percentages[m.id]) || 0)) /
                      100
                    ).toFixed(2)}
                  </span>
                )}
              </div>
            ))}
            <div
              style={{
                fontSize: 13,
                color: Math.abs(pctTotal - 100) < 0.01 ? T.green : T.red,
                fontWeight: 500,
                marginTop: 4,
              }}
            >
              Total: {pctTotal.toFixed(1)}%
              {Math.abs(pctTotal - 100) >= 0.01 ? " — must equal 100%" : " ✓"}
            </div>
          </div>
        )}

        {splitType === "custom" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 8,
            }}
          >
            {group.members.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Avatar name={m.name} index={i} size={28} src={m.avatarUrl} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                  {m.name}
                </span>
                <span style={{ fontSize: 14, color: T.secondary }}>$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={customs[m.id] || ""}
                  onChange={(e) => {
                    if (isNonNegativeInput(e.target.value))
                      setCustoms((p) => ({
                        ...p,
                        [m.id]: e.target.value,
                      }));
                  }}
                  onKeyDown={blockNegativeKeys}
                  placeholder="0"
                  style={{
                    ...inputStyle,
                    width: 90,
                    textAlign: "right",
                    padding: "8px 10px",
                  }}
                />
              </div>
            ))}
            <div
              style={{
                fontSize: 13,
                color:
                  amt > 0 && Math.abs(customTotal - amt) < 0.01
                    ? T.green
                    : T.red,
                fontWeight: 500,
                marginTop: 4,
              }}
            >
              Total: ${customTotal.toFixed(2)} / ${amt.toFixed(2)}
              {amt > 0 && Math.abs(customTotal - amt) >= 0.01
                ? " — doesn't match"
                : " ✓"}
            </div>
          </div>
        )}

        <div style={{ margin: "16px 0" }}>
          <Checkbox
            checked={recurring}
            onChange={setRecurring}
            label="Recurring monthly"
          />
        </div>

        <button
          onClick={handleSave}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: T.radius,
            border: "none",
            background: saved ? T.green : amt > 0 ? T.blue : "#c7c7cc",
            color: "#fff",
            fontFamily: T.font,
            fontSize: 17,
            fontWeight: 600,
            cursor: amt > 0 ? "pointer" : "default",
            transition: "background 0.3s",
            boxShadow: amt > 0 ? "0 4px 16px rgba(0,122,255,0.3)" : "none",
          }}
        >
          {saved ? "Saved ✓" : "Save Rent"}
        </button>
      </div>
    </div>
  );
}
