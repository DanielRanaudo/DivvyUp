"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability";

// Catches errors thrown by the root layout itself. Must render its own
// <html>/<body> because it replaces the root layout when active.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError("Root layout error boundary caught an error", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          background: "#f5f5f7",
          color: "#1d1d1f",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: 20,
          textAlign: "center",
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: "#5d5d63", margin: "0 0 20px" }}>
            The app hit an unexpected error. Try reloading.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              border: "none",
              background: "#007AFF",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
