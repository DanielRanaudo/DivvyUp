"use client";

import { T } from "@/lib/tokens";

interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/**
 * A checkbox with its label, replacing the `<div onClick>` pattern used
 * elsewhere in the app — those looked right but could not be reached or
 * toggled with a keyboard.
 *
 * The native input is visually hidden rather than removed, so it still takes
 * focus and announces its state. `.visually-hidden-input` in globals.css draws
 * the focus ring on the box next to it.
 */
export default function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: CheckboxProps) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "default" : "pointer",
        fontSize: 14,
        color: T.secondary,
        fontFamily: T.font,
      }}
    >
      <input
        type="checkbox"
        className="visually-hidden-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `1.5px solid ${checked ? T.blue : T.border}`,
          background: checked ? T.blue : "transparent",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </label>
  );
}
