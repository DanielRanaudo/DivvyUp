/**
 * Splits an amount evenly across the given members, distributing any leftover
 * cents to the first members so the returned shares sum exactly to `amount`.
 * This guarantees settlements net to zero (no penny drift).
 */
export function evenSplit(
  amount: number,
  memberIds: string[]
): Record<string, number> {
  const splits: Record<string, number> = {};
  if (memberIds.length === 0) return splits;

  const totalCents = Math.round(amount * 100);
  const base = Math.floor(totalCents / memberIds.length);
  let remainder = totalCents - base * memberIds.length;

  memberIds.forEach((id) => {
    const cents = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    splits[id] = cents / 100;
  });

  return splits;
}
