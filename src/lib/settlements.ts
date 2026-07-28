import type { Member, Charge, Payment, Settlement } from "./types";

/** Balances under a cent either way count as square. */
export const SETTLED_EPSILON = 0.01;

/**
 * The payments that move a balance: confirmed, and not swept up by a monthly
 * close. An archived payment already did its work — the month it belonged to
 * was settled up and whatever remained became that month's carry-forward, so
 * counting it again would credit the payer twice.
 */
function countedPayments(payments: Payment[]): Payment[] {
  return (payments || []).filter((p) => p.status === "confirmed" && !p.archived);
}

/**
 * Net position of every member: positive means the group owes them, negative
 * means they owe the group.
 *
 * Keys can include ids that are no longer members — a departed roommate still
 * appears in the splits of expenses they were part of. Callers that only care
 * about current members should look up by member id rather than iterating.
 */
export function calcBalances(
  members: Member[],
  charges: Charge[],
  payments: Payment[]
): Record<string, number> {
  const bal: Record<string, number> = {};
  members.forEach((m) => (bal[m.id] = 0));

  charges.forEach((c) => {
    Object.entries(c.splits).forEach(([mid, amt]) => {
      bal[mid] = (bal[mid] || 0) - amt;
    });
    if (c.paidBy) bal[c.paidBy] = (bal[c.paidBy] || 0) + c.amount;
  });

  countedPayments(payments).forEach((p) => {
    bal[p.fromId] = (bal[p.fromId] || 0) + p.amount;
    bal[p.toId] = (bal[p.toId] || 0) - p.amount;
  });

  return bal;
}

export function calcSmartSettlements(
  members: Member[],
  charges: Charge[],
  payments: Payment[]
): Settlement[] {
  const bal = calcBalances(members, charges, payments);

  const debtors: { id: string; name: string; amount: number }[] = [];
  const creditors: { id: string; name: string; amount: number }[] = [];

  members.forEach((m) => {
    const b = Math.round((bal[m.id] || 0) * 100) / 100;
    if (b < -0.01) debtors.push({ id: m.id, name: m.name, amount: -b });
    else if (b > 0.01) creditors.push({ id: m.id, name: m.name, amount: b });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amount, creditors[j].amount);
    if (amt > 0.01)
      settlements.push({
        fromId: debtors[i].id,
        fromName: debtors[i].name,
        toId: creditors[j].id,
        toName: creditors[j].name,
        amount: Math.round(amt * 100) / 100,
      });
    debtors[i].amount -= amt;
    creditors[j].amount -= amt;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return settlements;
}

export function calcSimpleSettlements(
  members: Member[],
  charges: Charge[],
  payments: Payment[]
): Settlement[] {
  const memberMap: Record<string, Member> = {};
  members.forEach((m) => (memberMap[m.id] = m));

  const pairDebt: Record<string, number> = {};
  charges.forEach((c) => {
    if (!c.paidBy) return;
    Object.entries(c.splits).forEach(([mid, amt]) => {
      if (mid === c.paidBy) return;
      const key = `${mid}->${c.paidBy}`;
      pairDebt[key] = (pairDebt[key] || 0) + amt;
    });
  });

  countedPayments(payments).forEach((p) => {
    const key = `${p.fromId}->${p.toId}`;
    pairDebt[key] = (pairDebt[key] || 0) - p.amount;
  });

  const netted: Record<string, number> = {};
  Object.entries(pairDebt).forEach(([key, amt]) => {
    const [from, to] = key.split("->");
    const reverseKey = `${to}->${from}`;
    if (netted[reverseKey] !== undefined) return;
    const reverse = pairDebt[reverseKey] || 0;
    const net = Math.round((amt - reverse) * 100) / 100;
    if (net > 0.01) netted[key] = net;
    else if (net < -0.01) netted[reverseKey] = -net;
  });

  const settlements: Settlement[] = [];
  Object.entries(netted).forEach(([key, amt]) => {
    const [fromId, toId] = key.split("->");
    if (amt > 0.01 && memberMap[fromId] && memberMap[toId])
      settlements.push({
        fromId,
        fromName: memberMap[fromId].name,
        toId,
        toName: memberMap[toId].name,
        amount: amt,
      });
  });
  settlements.sort((a, b) => b.amount - a.amount);
  return settlements;
}

export function calcSettlements(
  members: Member[],
  charges: Charge[],
  payments: Payment[],
  smart: boolean
): Settlement[] {
  return smart
    ? calcSmartSettlements(members, charges, payments)
    : calcSimpleSettlements(members, charges, payments);
}
