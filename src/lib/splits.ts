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

/**
 * Splits an amount in proportion to per-member weights (percentages, shares,
 * or custom dollar amounts — only the ratios matter).
 *
 * Leftover cents go to the members with the largest fractional remainder, so
 * the shares sum exactly to `amount`. Negative weights count as zero, and
 * weights that sum to zero fall back to an even split.
 */
export function splitByWeights(
  amount: number,
  weights: Record<string, number>
): Record<string, number> {
  const ids = Object.keys(weights);
  if (ids.length === 0) return {};

  const positive = (id: string) => Math.max(0, weights[id] || 0);
  const totalWeight = ids.reduce((sum, id) => sum + positive(id), 0);
  if (totalWeight <= 0) return evenSplit(amount, ids);

  const totalCents = Math.round(amount * 100);
  const exact = ids.map((id) => ({
    id,
    cents: (positive(id) / totalWeight) * totalCents,
  }));

  const cents: Record<string, number> = {};
  let assigned = 0;
  exact.forEach((e) => {
    const floored = Math.floor(e.cents);
    cents[e.id] = floored;
    assigned += floored;
  });

  const byRemainder = [...exact].sort((a, b) => (b.cents % 1) - (a.cents % 1));
  let leftover = totalCents - assigned;
  for (let i = 0; leftover > 0; i = (i + 1) % byRemainder.length) {
    cents[byRemainder[i].id] += 1;
    leftover--;
  }

  return Object.fromEntries(
    Object.entries(cents).map(([id, c]) => [id, c / 100])
  );
}

/**
 * One person's share of an evenly divided charge, for previews.
 *
 * Unrounded on purpose: this is the "$12.50 per person" line under an amount
 * field, not the split that gets stored. Use evenSplit for anything that has
 * to add back up to the total.
 */
export function evenShare(amount: number, people: number): number {
  return people > 0 ? amount / people : 0;
}
