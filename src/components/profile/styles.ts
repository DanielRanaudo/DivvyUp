import { T } from "@/lib/tokens";

/** The quiet left-hand side of a label/value row. */
export const rowLabel: React.CSSProperties = {
  fontSize: 13,
  color: T.secondary,
  fontWeight: 500,
};

export const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: T.tertiary,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  margin: "28px 0 10px",
};

export const pillButton: React.CSSProperties = {
  border: "none",
  borderRadius: 20,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: T.font,
};
