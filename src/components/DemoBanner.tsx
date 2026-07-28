"use client";

import { IS_DEMO, IS_SANDBOX } from "@/lib/config";
import { T } from "@/lib/tokens";

/**
 * Says out loud that nothing is being saved. Without this, demo mode looks
 * exactly like the real app right up to the moment the tab is closed.
 */
export default function DemoBanner() {
  if (!IS_DEMO) return null;

  return (
    <div
      role="status"
      style={{
        background: T.orange,
        color: "#fff",
        fontFamily: T.font,
        fontSize: 13,
        fontWeight: 500,
        textAlign: "center",
        padding: "7px 16px",
        lineHeight: 1.4,
      }}
    >
      {IS_SANDBOX ? "Sandbox mode" : "Demo mode"} — no account is connected and
      nothing you enter here is saved.
    </div>
  );
}
