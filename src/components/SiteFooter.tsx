import Link from "next/link";
import { T } from "@/lib/tokens";

const linkStyle = {
  color: T.tertiary,
  fontSize: 12,
  textDecoration: "none",
} as const;

/** Legal links, required because the app stores emails and payment handles. */
export default function SiteFooter() {
  return (
    <footer
      style={{
        padding: "24px 20px 32px",
        display: "flex",
        justifyContent: "center",
        gap: 16,
        fontFamily: T.font,
      }}
    >
      <Link href="/privacy" style={linkStyle}>
        Privacy
      </Link>
      <span aria-hidden="true" style={{ color: T.border, fontSize: 12 }}>
        ·
      </span>
      <Link href="/terms" style={linkStyle}>
        Terms
      </Link>
    </footer>
  );
}
