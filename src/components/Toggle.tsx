"use client";

import { T } from "@/lib/tokens";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Names the control for screen readers, since the switch has no text. */
  label: string;
  disabled?: boolean;
}

/** An on/off switch that reports its state to assistive technology. */
export default function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 52,
        height: 32,
        borderRadius: 16,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        background: checked ? T.green : "rgba(0,0,0,0.1)",
        position: "relative",
        transition: "background 0.3s",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: 26,
          height: 26,
          borderRadius: 13,
          background: "#fff",
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}
