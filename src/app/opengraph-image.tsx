import { ImageResponse } from "next/og";

export const alt = "DivvyUp — Payment Planning for Roommates";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card shown when a link to the app is shared. Generated rather than
 * committed as a binary, so it stays in step with the brand colours.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: "linear-gradient(135deg, #007AFF, #5856D6)",
        color: "#fff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: "-0.03em" }}>
        divvyup
      </div>
      <div style={{ fontSize: 34, opacity: 0.85 }}>
        Split rent, bills, and expenses with your roommates
      </div>
    </div>,
    size
  );
}
