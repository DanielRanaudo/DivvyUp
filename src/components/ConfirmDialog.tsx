"use client";

import { T } from "@/lib/tokens";
import Modal from "@/components/Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain language. */
  message: string;
  /** Extra consequences to spell out before the user commits. */
  details?: string[];
  confirmLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks before doing something irreversible. Replaces both window.confirm and
 * the delete buttons that acted on the first click.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  details,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p
        style={{
          fontSize: 14,
          color: T.secondary,
          lineHeight: 1.6,
          margin: "0 0 12px",
        }}
      >
        {message}
      </p>

      {details && details.length > 0 && (
        <ul
          style={{
            margin: "0 0 16px",
            paddingLeft: 20,
            fontSize: 13,
            color: T.secondary,
            lineHeight: 1.7,
          }}
        >
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "11px 0",
            borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.text,
            fontFamily: T.font,
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: "11px 0",
            borderRadius: T.radiusSm,
            border: "none",
            background: destructive ? T.red : T.blue,
            color: "#fff",
            fontFamily: T.font,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
