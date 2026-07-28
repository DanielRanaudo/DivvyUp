"use client";

import { T, cardStyle } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";

interface BalanceHeroProps {
  owed: number;
  owing: number;
  onSettleUp: () => void;
}

/** The one number people open the app for, and the two behind it. */
export default function BalanceHero({
  owed,
  owing,
  onSettleUp,
}: BalanceHeroProps) {
  const net = owed - owing;
  // A cent either way is rounding, not a debt.
  const up = net > 0.01;
  const down = net < -0.01;

  return (
    <>
      <div
        style={{
          ...cardStyle,
          padding: "28px 24px",
          marginBottom: 16,
          textAlign: "center",
          background: down
            ? "linear-gradient(135deg, rgba(255,59,48,0.08), rgba(255,149,0,0.06))"
            : "linear-gradient(135deg, rgba(52,199,89,0.08), rgba(0,122,255,0.06))",
          border: `1px solid ${
            down ? "rgba(255,59,48,0.15)" : "rgba(52,199,89,0.15)"
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
            color: up ? T.green : down ? T.red : T.secondary,
          }}
        >
          {net > 0 ? "+" : net < 0 ? "−" : ""}
          {formatMoney(Math.abs(net))}
        </div>
        <div style={{ fontSize: 14, color: T.secondary, marginTop: 4 }}>
          {up ? "You're owed money" : down ? "You owe money" : "All settled up"}
        </div>
        {down && (
          <button
            onClick={onSettleUp}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        <Total label="You Owe" amount={owing} color={T.red} />
        <Total label="Owed to You" amount={owed} color={T.green} />
      </div>
    </>
  );
}

function Total({
  label,
  amount,
  color,
}: {
  label: string;
  amount: number;
  color: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 500, color: T.secondary }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 22,
          fontWeight: 700,
          color: amount > 0 ? color : T.tertiary,
          marginTop: 4,
        }}
      >
        {formatMoney(amount)}
      </div>
    </div>
  );
}
