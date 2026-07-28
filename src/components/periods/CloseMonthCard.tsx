"use client";

import { useState } from "react";
import { T, cardStyle } from "@/lib/tokens";
import { closePreview, formatPeriod, periodKey } from "@/lib/periods";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Charge, Group } from "@/lib/types";

interface CloseMonthCardProps {
  group: Group;
  allCharges: Charge[];
  /** Resolves to an error message, or null when the month closed. */
  onClose: () => Promise<string | null>;
}

/**
 * Draws a line under the month: archives what is finished and carries the
 * outstanding debts forward. Treasurer only.
 */
export default function CloseMonthCard({
  group,
  allCharges,
  onClose,
}: CloseMonthCardProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const month = formatPeriod(periodKey(new Date()));
  const alreadyClosed = (group.periods ?? []).some(
    (p) => p.period === periodKey(new Date())
  );

  const confirm = async () => {
    setBusy(true);
    const message = await onClose();
    setBusy(false);
    setAsking(false);
    setError(message);
  };

  return (
    <div style={{ ...cardStyle, marginTop: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
        Close out {month}
      </div>
      <div style={{ fontSize: 14, color: T.secondary, lineHeight: 1.6 }}>
        {alreadyClosed
          ? `${month} has already been closed. The next one can be closed when it arrives.`
          : "Files this month's expenses and payments away, and carries whatever is still owed into the new month. Rent and recurring bills charge again."}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            fontSize: 13,
            fontWeight: 500,
            color: T.red,
          }}
        >
          {error}
        </div>
      )}

      {!alreadyClosed && (
        <button
          onClick={() => {
            setError(null);
            setAsking(true);
          }}
          disabled={busy}
          style={{
            marginTop: 14,
            padding: "10px 20px",
            borderRadius: 20,
            border: "none",
            background: busy ? "#c7c7cc" : T.blue,
            color: "#fff",
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Closing…" : `Close ${month}`}
        </button>
      )}

      <ConfirmDialog
        open={asking}
        title={`Close ${month}?`}
        message="This can't be undone from the app."
        details={closePreview(group, allCharges)}
        confirmLabel="Close the month"
        onConfirm={confirm}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
