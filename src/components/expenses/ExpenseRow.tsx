"use client";

import type { ReactNode } from "react";
import { T } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";
import { isPdfReceipt } from "@/lib/receipts";
import type { Expense } from "@/lib/types";

/** The first receipt, as a thumbnail that opens the full set. */
function ReceiptThumb({
  images,
  urls,
  onView,
}: {
  images?: string[];
  urls: Record<string, string>;
  onView: (ref: string) => void;
}) {
  if (!images || images.length === 0) return null;
  const first = images[0];
  const src = urls[first] ?? "";
  return (
    <button
      onClick={() => onView(first)}
      aria-label="View receipt"
      style={{
        position: "relative",
        width: 40,
        height: 40,
        padding: 0,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        background: T.bg,
        flexShrink: 0,
      }}
    >
      {isPdfReceipt(first) || !src ? (
        <span
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: isPdfReceipt(first) ? T.red : T.tertiary,
            background: T.bg,
          }}
        >
          {isPdfReceipt(first) ? "PDF" : "…"}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {images.length > 1 && (
        <span
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 4px",
            borderTopLeftRadius: 6,
          }}
        >
          {images.length}
        </span>
      )}
    </button>
  );
}

type RowButtonTone = "plain" | "confirm" | "danger";

const TONES: Record<RowButtonTone, { background: string; color: string }> = {
  plain: { background: T.bg, color: T.secondary },
  confirm: { background: T.green, color: "#fff" },
  danger: { background: T.bg, color: T.red },
};

/** One action on an expense row. Icon-only buttons still need a label. */
export function RowButton({
  label,
  children,
  tone = "plain",
  onClick,
}: {
  label: string;
  children: ReactNode;
  tone?: RowButtonTone;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        height: 32,
        minWidth: 32,
        padding: "0 8px",
        borderRadius: 8,
        border: "none",
        fontFamily: T.font,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...TONES[tone],
      }}
    >
      {children}
    </button>
  );
}

interface ExpenseRowProps {
  expense: Expense;
  /** Who submitted it, how it was split, when — assembled by the caller. */
  meta: string;
  /** Tints the icon tile to match the section. */
  iconBackground: string;
  receiptUrls: Record<string, string>;
  onViewReceipt: (ref: string) => void;
  actions?: ReactNode;
  divider: boolean;
}

export default function ExpenseRow({
  expense,
  meta,
  iconBackground,
  receiptUrls,
  onViewReceipt,
  actions,
  divider,
}: ExpenseRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderBottom: divider ? `1px solid ${T.border}` : "none",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: iconBackground,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        🛒
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>
          {expense.description}
        </div>
        <div style={{ fontSize: 12, color: T.tertiary }}>{meta}</div>
      </div>
      <ReceiptThumb
        images={expense.images}
        urls={receiptUrls}
        onView={onViewReceipt}
      />
      <div style={{ fontFamily: T.mono, fontWeight: 600, fontSize: 14 }}>
        {formatMoney(expense.amount)}
      </div>
      {actions && <div style={{ display: "flex", gap: 6 }}>{actions}</div>}
    </div>
  );
}
