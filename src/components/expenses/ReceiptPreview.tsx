"use client";

import { T } from "@/lib/tokens";
import { isPdfReceipt } from "@/lib/receipts";

interface ReceiptPreviewProps {
  /** The stored reference, which says whether this is a PDF. */
  receiptRef: string;
  /** The signed URL, once it has come back. */
  url?: string;
}

/** A receipt at full size, in the lightbox. */
export default function ReceiptPreview({
  receiptRef,
  url,
}: ReceiptPreviewProps) {
  if (!url) {
    return (
      <div
        style={{
          margin: "auto",
          color: "#fff",
          fontSize: 15,
          fontFamily: T.font,
        }}
      >
        Loading receipt…
      </div>
    );
  }

  if (isPdfReceipt(receiptRef)) {
    return (
      <iframe
        src={url}
        title="Receipt PDF"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: T.radius,
          boxShadow: T.shadowLg,
          background: "#fff",
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Receipt"
      style={{
        margin: "auto",
        maxWidth: "100%",
        maxHeight: "100%",
        borderRadius: T.radius,
        boxShadow: T.shadowLg,
      }}
    />
  );
}
