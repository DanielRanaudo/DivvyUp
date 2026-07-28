"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keeps keyboard focus inside an open overlay and hands it back where it came
 * from on close, so a keyboard or screen-reader user can't tab off into the
 * page behind the dialog.
 *
 * Attach the returned ref to the overlay container. Escape calls `onClose`.
 */
export function useFocusTrap<T extends HTMLElement>(
  open: boolean,
  onClose: () => void
) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus in so the first Tab stays inside, and so screen readers
    // announce the dialog rather than continuing from the old position.
    (focusable()[0] ?? container)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !container?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return containerRef;
}
