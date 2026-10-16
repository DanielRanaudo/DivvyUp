import type { Metadata } from "next";
import LegalPage, { Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms — DivvyUp",
  description: "The terms for using DivvyUp.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="16 October 2026">
      <p>
        DivvyUp helps roommates keep track of who owes what. Using it means
        accepting the following.
      </p>

      <Section heading="It does not move money">
        <p>
          DivvyUp is a ledger, not a payment processor. It records what the
          people in your group tell it, and it never touches your bank account.
          Actual payments happen elsewhere — Venmo, Zelle, cash — and marking a
          payment as confirmed in DivvyUp is one roommate saying they received
          it, not a guarantee from us that they did.
        </p>
      </Section>

      <Section heading="The numbers are only as good as the input">
        <p>
          Balances are arithmetic on figures your group entered. Nothing is
          verified against a receipt, a lease, or a bank statement. Check the
          numbers before you pay someone, and settle disagreements with your
          roommates rather than with the app.
        </p>
      </Section>

      <Section heading="Owners and treasurers have different authority">
        <p>
          The person who creates a group is its owner and may manage chores,
          members, and group settings while they remain a member. Each group
          also has a treasurer, who sets rent, adds bills, and approves or
          denies expense requests. The owner may assign that role but does not
          gain its financial powers unless they are also the treasurer. Choose
          both roles carefully. Everyone in the group can see its charges and
          payments.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          Keep your password to yourself and use an email address you control.
          You are responsible for what happens under your account. Don&apos;t
          upload receipts or set names that you have no right to share.
        </p>
      </Section>

      <Section heading="No warranty">
        <p>
          DivvyUp is provided as is, with no guarantee that it will be
          available, error-free, or that your data will survive. Keep your own
          record of anything that matters financially. Nobody involved in
          running DivvyUp is liable for money lost, disputes between roommates,
          or decisions made based on what the app displayed.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          These terms may change as the app does. Continuing to use DivvyUp
          after a change means accepting the updated version.
        </p>
      </Section>
    </LegalPage>
  );
}
