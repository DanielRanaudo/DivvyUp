import type { KeyboardEvent } from "react";

/**
 * Blocks keystrokes that would produce a negative or exponent number value
 * (the "-" and "e" characters that <input type="number"> otherwise allows).
 */
export function blockNegativeKeys(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key === "-" || e.key === "e" || e.key === "E") e.preventDefault();
}

/**
 * Returns true if a raw number-input string is empty or non-negative.
 * Use to guard onChange so negative values can't be entered.
 */
export function isNonNegativeInput(value: string): boolean {
  return value === "" || parseFloat(value) >= 0;
}
