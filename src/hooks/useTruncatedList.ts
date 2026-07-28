"use client";

import { useState } from "react";

export interface TruncatedList<T> {
  visible: T[];
  hidden: number;
  showMore: () => void;
}

/**
 * Shows the first slice of a list and grows it on request.
 *
 * For lists that are already in memory — a busy month's expenses, say. The
 * archive, which isn't loaded until asked for, uses usePagedList instead.
 */
export function useTruncatedList<T>(items: T[], step = 10): TruncatedList<T> {
  const [limit, setLimit] = useState(step);
  return {
    visible: items.slice(0, limit),
    hidden: Math.max(0, items.length - limit),
    showMore: () => setLimit((current) => current + step),
  };
}
