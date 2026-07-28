"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { T, inputStyle, labelStyle, cardStyle } from "@/lib/tokens";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import {
  fileToCompressedDataURL,
  fileToCompressedBlob,
  fileToDataURL,
} from "@/lib/image";
import {
  uploadReceipts,
  isPdfReceipt,
  type ReceiptUpload,
} from "@/lib/receipts";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

export interface ExpenseFields {
  description: string;
  amount: number;
  images: string[];
}

interface ExpenseFormProps {
  groupId: string;
  /** Null in sandbox mode, where receipts stay in memory as data URLs. */
  supabase: SupabaseClient | null;
  /** Attached receipts, held by the parent so it can sign them all at once. */
  images: string[];
  onImagesChange: (next: string[]) => void;
  receiptUrls: Record<string, string>;
  onViewReceipt: (ref: string) => void;
  initialDescription?: string;
  initialAmount?: string;
  /** Names what is being worked on, when that isn't obvious from the button. */
  heading?: string;
  submitLabel: string;
  onSubmit: (fields: ExpenseFields) => void;
  onCancel?: () => void;
}

/**
 * Description, amount and receipts for one expense. Used both to submit a new
 * one and to correct a pending one, so the two can't drift apart.
 *
 * Text fields are internal state seeded from props; mount it with a `key` tied
 * to what is being edited to start over.
 */
export default function ExpenseForm({
  groupId,
  supabase,
  images,
  onImagesChange,
  receiptUrls,
  onViewReceipt,
  initialDescription = "",
  initialAmount = "",
  heading,
  submitLabel,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const [desc, setDesc] = useState(initialDescription);
  const [amount, setAmount] = useState(initialAmount);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const amountValue = parseFloat(amount);
  const ready = desc.trim() !== "" && !isNaN(amountValue) && amountValue > 0;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const all = Array.from(fileList);
    const files = all.filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (files.length === 0) {
      setUploadError("Only PNG, JPG, or PDF files are allowed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadError(
      files.length < all.length
        ? "Some files were skipped (PNG, JPG, PDF only)."
        : ""
    );
    try {
      if (supabase) {
        // Backend mode: upload to Storage and keep only the paths (base64 in
        // the database bloats every fetch). Images are compressed to JPEG;
        // PDFs are uploaded as-is.
        const uploads: ReceiptUpload[] = await Promise.all(
          files.map(async (f) =>
            f.type === "application/pdf"
              ? { blob: f, ext: "pdf", contentType: "application/pdf" }
              : {
                  blob: await fileToCompressedBlob(f),
                  ext: "jpg",
                  contentType: "image/jpeg",
                }
          )
        );
        const refs = await uploadReceipts(supabase, groupId, uploads);
        onImagesChange([...images, ...refs]);
      } else {
        // Sandbox mode: no storage, so receipts live in memory.
        const encoded = await Promise.all(
          files.map((f) =>
            f.type === "application/pdf"
              ? fileToDataURL(f)
              : fileToCompressedDataURL(f)
          )
        );
        onImagesChange([...images, ...encoded]);
      }
    } catch {
      setUploadError("Receipt upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      {heading && (
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            margin: "0 0 14px",
          }}
        >
          {heading}
        </h3>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="expense-description">
            Description
          </label>
          <input
            id="expense-description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Toilet paper, etc."
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="expense-amount">
            Amount
          </label>
          <input
            id="expense-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => {
              if (isNonNegativeInput(e.target.value)) setAmount(e.target.value);
            }}
            onKeyDown={blockNegativeKeys}
            placeholder="0.00"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="expense-receipts">
          Receipts
        </label>
        <input
          id="expense-receipts"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: "none" }}
        />
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {images.map((src, i) => (
            <div
              key={src}
              style={{ position: "relative", width: 64, height: 64 }}
            >
              {isPdfReceipt(src) ? (
                <button
                  onClick={() => onViewReceipt(src)}
                  aria-label={`View receipt ${i + 1} (PDF)`}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: T.radiusSm,
                    border: `1px solid ${T.border}`,
                    background: T.bg,
                    color: T.red,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  PDF
                </button>
              ) : (
                <button
                  onClick={() => onViewReceipt(src)}
                  aria-label={`View receipt ${i + 1}`}
                  style={{
                    width: 64,
                    height: 64,
                    padding: 0,
                    borderRadius: T.radiusSm,
                    border: `1px solid ${T.border}`,
                    background: T.bg,
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={receiptUrls[src] ?? ""}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </button>
              )}
              <button
                onClick={() => onImagesChange(images.filter((_, j) => j !== i))}
                aria-label={`Remove receipt ${i + 1}`}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  border: "none",
                  background: T.red,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach a receipt"
            style={{
              width: 64,
              height: 64,
              borderRadius: T.radiusSm,
              border: `1px dashed ${T.tertiary}`,
              background: T.bg,
              color: T.secondary,
              fontSize: 22,
              cursor: uploading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {uploading ? "…" : "+"}
          </button>
        </div>
        {uploadError && (
          <div
            style={{
              color: T.red,
              fontSize: 13,
              fontWeight: 500,
              marginTop: 8,
            }}
          >
            {uploadError}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: T.radiusSm,
              border: `1px solid ${T.border}`,
              background: "transparent",
              color: T.text,
              fontFamily: T.font,
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={() =>
            ready &&
            onSubmit({
              description: desc.trim(),
              amount: amountValue,
              images,
            })
          }
          disabled={!ready}
          style={{
            flex: 2,
            padding: "12px 0",
            borderRadius: T.radiusSm,
            border: "none",
            background: ready ? T.blue : "#c7c7cc",
            color: "#fff",
            fontFamily: T.font,
            fontSize: 15,
            fontWeight: 600,
            cursor: ready ? "pointer" : "default",
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
