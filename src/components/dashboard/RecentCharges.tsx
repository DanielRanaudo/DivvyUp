"use client";

import { T, cardStyle, overline } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";
import type { Charge } from "@/lib/types";

const LOOK = {
  rent: { icon: "🏠", tint: "rgba(255,149,0,0.1)" },
  utility: { icon: "⚡", tint: "rgba(0,122,255,0.1)" },
  subgroup: { icon: "🧻", tint: "rgba(175,82,222,0.1)" },
  expense: { icon: "🛒", tint: "rgba(88,86,214,0.1)" },
  carryover: { icon: "🗓️", tint: "rgba(142,142,147,0.12)" },
} as const;

function who(charge: Charge): string {
  switch (charge.type) {
    case "expense":
      return `by ${charge.submittedByName}`;
    case "subgroup":
      return `${charge.subgroupName} · paid by ${charge.submittedByName}`;
    case "carryover":
      return "Carried over";
    default:
      return "Treasurer";
  }
}

/** The last few things the house was charged for, newest first. */
export default function RecentCharges({ charges }: { charges: Charge[] }) {
  if (charges.length === 0) return null;
  const recent = charges.slice(-5).reverse();

  return (
    <div>
      <h3 style={overline}>Recent</h3>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {recent.map((c, i) => {
          const look = LOOK[c.type] ?? LOOK.expense;
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 18px",
                borderBottom:
                  i < recent.length - 1 ? `1px solid ${T.border}` : "none",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: look.tint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                }}
              >
                {look.icon}
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
                <div style={{ fontSize: 12, color: T.tertiary }}>{who(c)}</div>
              </div>
              <div
                style={{ fontFamily: T.mono, fontWeight: 600, fontSize: 14 }}
              >
                {formatMoney(c.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
