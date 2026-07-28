import Link from "next/link";
import type { ReactNode } from "react";
import { T } from "@/lib/tokens";

interface LegalPageProps {
  title: string;
  updated: string;
  children: ReactNode;
}

/** Shared shell for the privacy and terms pages. */
export default function LegalPage({
  title,
  updated,
  children,
}: LegalPageProps) {
  return (
    <main
      style={{
        fontFamily: T.font,
        color: T.text,
        background: T.bg,
        minHeight: "100vh",
        padding: "32px 20px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Link
          href="/"
          style={{ fontSize: 14, color: T.blue, textDecoration: "none" }}
        >
          ← Back to DivvyUp
        </Link>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "20px 0 4px",
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 13, color: T.tertiary, margin: "0 0 28px" }}>
          Last updated {updated}
        </p>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: T.secondary,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {children}
        </div>
      </div>
    </main>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: T.text,
          margin: "0 0 8px",
        }}
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}
