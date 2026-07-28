"use client";

import { T } from "@/lib/tokens";

interface ShowMoreRowProps {
  /** How many more there are. Nothing renders when this is zero. */
  hidden: number;
  /** What is being listed, e.g. "expenses". */
  label: string;
  onClick: () => void;
}

/** The last row of a truncated list. */
export default function ShowMoreRow({
  hidden,
  label,
  onClick,
}: ShowMoreRowProps) {
  if (hidden <= 0) return null;
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "12px 18px",
        border: "none",
        borderTop: `1px solid ${T.border}`,
        background: "none",
        color: T.blue,
        fontFamily: T.font,
        fontSize: 14,
        fontWeight: 600,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      Show {hidden} more {label}
    </button>
  );
}
