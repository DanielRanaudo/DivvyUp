import type { Group, Payment } from "@/lib/types";

/** The recipient's or treasurer's answer to "did this money actually arrive?". */
export type PaymentDecision = "confirmed" | "rejected";

/**
 * Pending payments this member can review. A treasurer may review every
 * payment in the household by passing `canReviewAll`.
 *
 * Only confirmed payments move a balance, so anything in here is still counted
 * as owed.
 */
export function paymentsAwaiting(
  payments: Payment[] | undefined,
  memberId: string,
  canReviewAll = false
): Payment[] {
  return (payments ?? []).filter(
    (p) => (canReviewAll || p.toId === memberId) && p.status === "pending"
  );
}

/**
 * Records the recipient's or treasurer's decision on one payment.
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
