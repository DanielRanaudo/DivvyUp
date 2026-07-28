import type { Metadata } from "next";
import LegalPage, { Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy — DivvyUp",
  description: "What DivvyUp stores about you, and why.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="27 July 2026">
      <p>
        DivvyUp is a tool for splitting household costs between roommates. It
        stores the minimum needed to do that, and nothing is sold or shared with
        advertisers.
      </p>

      <Section heading="What is stored">
        <ul style={{ paddingLeft: 20 }}>
          <li>
            <strong>Your email address</strong>, so you can sign in and reset
            your password.
          </li>
          <li>
            <strong>Your display name</strong> and, if you choose to add them,
            your <strong>Venmo username and Zelle phone number</strong>. These
            are shown to the other members of any group you join, so they know
            where to send money.
          </li>
          <li>
            <strong>Your profile picture</strong>, if you upload one.
          </li>
          <li>
            <strong>The financial records you enter</strong>: rent, bills,
            expenses, chores, and payments, along with any receipt images you
            attach.
          </li>
        </ul>
      </Section>

      <Section heading="Who can see it">
        <p>
          People in the same group as you can see your display name, payment
          handles, profile picture, and the charges and payments you are part
          of. That is the point of the app. People outside your groups cannot:
          access is enforced by the database itself, not just by the interface.
        </p>
        <p>
          Receipt images are stored privately. Viewing one requires a link that
          is generated on request, expires after an hour, and is only issued to
          current members of the group the receipt belongs to.
        </p>
      </Section>

      <Section heading="Who it is shared with">
        <p>
          Data is held in{" "}
          <a
            href="https://supabase.com/privacy"
            style={{ color: "#007AFF" }}
            rel="noreferrer noopener"
            target="_blank"
          >
            Supabase
          </a>
          , which provides the database, authentication, and file storage.
          Account emails (sign-up confirmations, password resets) are delivered
          through an email provider. There is no advertising or analytics
          tracking in DivvyUp.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Your data stays for as long as your account exists. Leaving a group
          removes you from it, though records of expenses and payments you were
          part of remain visible to that group — deleting them would change what
          everyone else is shown to owe. Deleting your account removes your
          profile, email, and payment handles.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          You can change or clear your name, payment handles, and profile
          picture at any time from your profile, leave any group, and request
          deletion of your account. Venmo and Zelle details are optional; the
          app works without them.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          For anything about your data, including a deletion request, contact
          the person who runs this instance of DivvyUp.
        </p>
      </Section>
    </LegalPage>
  );
}
