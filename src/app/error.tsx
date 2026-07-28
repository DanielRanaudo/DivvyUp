"use client";

import { useEffect } from "react";
import { T, cardStyle } from "@/lib/tokens";
import { reportError } from "@/lib/observability";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError("App error boundary caught an error", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <div
      style={{
        fontFamily: T.font,
        color: T.text,
        background: T.bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ ...cardStyle, maxWidth: 400, textAlign: "center" }}>
        <div aria-hidden="true" style={{ fontSize: 40, marginBottom: 12 }}>
          😵
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
          Something went wrong
        </h2>
        <p
          style={{
            fontSize: 14,
            color: T.secondary,
            margin: "0 0 20px",
            lineHeight: 1.5,
          }}
        >
          The app hit an unexpected error. Your data is safe — try reloading.
          {error.digest && (
            <span
              style={{
                display: "block",
                marginTop: 8,
                fontFamily: T.mono,
                fontSize: 11,
                color: T.tertiary,
              }}
            >
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            padding: "10px 24px",
            borderRadius: T.radiusSm,
            border: "none",
            background: T.blue,
            color: "#fff",
            fontFamily: T.font,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
