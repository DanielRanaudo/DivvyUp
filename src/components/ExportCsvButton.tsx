"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { buildLedgerCsv, ledgerFilename, type ExportRange } from "@/lib/csv";
import { downloadText } from "@/lib/download";
import { reportError } from "@/lib/observability";
import type { Group } from "@/lib/types";

interface ExportCsvButtonProps {
  group: Group;
  /** Loads the rows to export; archived months fetch them on demand. */
  range: () => Promise<ExportRange>;
  label?: string;
}

export default function ExportCsvButton({
  group,
  range,
  label = "Export CSV",
}: ExportCsvButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await range();
      downloadText(
        ledgerFilename(group, data.period),
        buildLedgerCsv(group, data)
      );
    } catch (e) {
      reportError("CSV export failed", e);
      setError("Couldn't build the export. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={run}
        disabled={busy}
        style={{
          padding: "8px 16px",
          borderRadius: 20,
          border: `1px solid ${T.border}`,
          background: T.card,
          color: T.text,
          fontFamily: T.font,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Preparing…" : label}
      </button>
      {error && (
        <span role="alert" style={{ color: T.red, fontSize: 13 }}>
          {error}
        </span>
      )}
    </span>
  );
}
