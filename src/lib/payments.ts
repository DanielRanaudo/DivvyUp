import type { Group, Payment } from "@/lib/types";

/** The recipient's answer to "did this money actually arrive?". */
export type PaymentDecision = "confirmed" | "rejected";

/**
 * Payments someone says they sent to `memberId` that haven't been answered yet.
 *
 * Only confirmed payments move a balance, so anything in here is still counted
 * as owed.
 */
export function paymentsAwaiting(
  payments: Payment[] | undefined,
  memberId: string
): Payment[] {
  return (payments ?? []).filter(
    (p) => p.toId === memberId && p.status === "pending"
  );
}

/**
 * Records the recipient's decision on one payment.
 *
 * The database re-checks who is allowed to do this in confirm_payment; this
 * only updates the copy on screen.
 */
export function decidePayment(
  group: Group,
  paymentId: string,
  decision: PaymentDecision
): Group {
  return {
    ...group,
    payments: (group.payments ?? []).map((p) =>
      p.id === paymentId ? { ...p, status: decision } : p
    ),
  };
}
