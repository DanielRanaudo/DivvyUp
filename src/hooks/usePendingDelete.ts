"use client";

import { useCallback, useState } from "react";

export interface PendingDelete<T> {
  /** What is about to be deleted, or null when nothing has been asked. */
  target: T | null;
  ask: (item: T) => void;
  cancel: () => void;
  confirm: () => void;
}

/**
 * Holds a delete until it has been confirmed.
 *
 * Every delete in the app used to act on the first click, one row away from
 * the buttons people press all day.
 */
export function usePendingDelete<T>(
  onDelete: (item: T) => void
): PendingDelete<T> {
  const [target, setTarget] = useState<T | null>(null);

  const confirm = useCallback(() => {
    if (target !== null) onDelete(target);
    setTarget(null);
  }, [target, onDelete]);

  return {
    target,
    ask: useCallback((item: T) => setTarget(item), []),
    cancel: useCallback(() => setTarget(null), []),
    confirm,
  };
}
