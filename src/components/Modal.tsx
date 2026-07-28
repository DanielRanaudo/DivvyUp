"use client";

import type { ReactNode } from "react";
import { T } from "@/lib/tokens";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Announced as the dialog's name; also shown as a heading unless hidden. */
  title: string;
  /** Set for image/PDF viewers where a visible title would be in the way. */
  hideTitle?: boolean;
  /** Fills the viewport instead of sitting in a card. */
  fullBleed?: boolean;
  children: ReactNode;
}

/**
 * An accessible overlay: labelled, focus-trapped, closable with Escape or a
 * click on the backdrop, and it returns focus to the trigger afterwards.
 */
export default function Modal({
  open,
  onClose,
  title,
  hideTitle,
  fullBleed,
  children,
}: ModalProps) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: fullBleed ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={
          fullBleed
            ? { width: "100%", height: "100%", display: "flex" }
            : {
                background: T.cardSolid,
                borderRadius: T.radius,
                boxShadow: T.shadowLg,
                padding: 24,
                width: "100%",
                maxWidth: 400,
              }
        }
      >
        {!hideTitle && (
          <h2
            style={{
              fontSize: 17,
              fontWeight: 600,
              margin: "0 0 8px",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
      <button
        onClick={onClose}
        aria-label={`Close ${title}`}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: 20,
          border: "none",
          background: fullBleed ? "rgba(255,255,255,0.15)" : "transparent",
          color: fullBleed ? "#fff" : T.secondary,
          fontSize: 22,
          cursor: "pointer",
          fontFamily: T.font,
        }}
      >
        ×
      </button>
    </div>
  );
}
