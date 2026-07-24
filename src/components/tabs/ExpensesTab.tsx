"use client";

import { useRef, useState } from "react";
import { T, inputStyle, labelStyle, cardStyle, secTitle } from "@/lib/tokens";
import { uid } from "@/lib/utils";
import { USE_BACKEND } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { blockNegativeKeys, isNonNegativeInput } from "@/lib/inputs";
import {
  fileToCompressedDataURL,
  fileToCompressedBlob,
  fileToDataURL,
} from "@/lib/image";
import { uploadReceipts, type ReceiptUpload } from "@/lib/receipts";
import type { Group, Member } from "@/lib/types";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

/** True when a stored receipt (public URL or data URL) is a PDF, not an image. */
function isPdfReceipt(src: string): boolean {
  return /\.pdf(?:$|\?)/i.test(src) || src.startsWith("data:application/pdf");
}

interface ExpensesTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  currentUser: Member;
  isTreasurer: boolean;
}

function ReceiptThumbs({
  images,
  onView,
}: {
  images?: string[];
  onView: (src: string) => void;
}) {
  if (!images || images.length === 0) return null;
  return (
    <button
      onClick={() => onView(images[0])}
      aria-label="View receipt"
      style={{
        position: "relative",
        width: 40,
        height: 40,
        padding: 0,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        background: T.bg,
        flexShrink: 0,
      }}
    >
      {isPdfReceipt(images[0]) ? (
        <span
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: T.red,
            background: T.bg,
          }}
        >
          PDF
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={images[0]}
          alt="Receipt"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {images.length > 1 && (
        <span
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 4px",
            borderTopLeftRadius: 6,
          }}
        >
          {images.length}
        </span>
      )}
    </button>
  );
}

export default function ExpensesTab({
  group,
  setGroup,
  currentUser,
  isTreasurer,
}: ExpensesTabProps) {
  const [supabase] = useState(() =>
    USE_BACKEND && typeof window !== "undefined" ? createClient() : null
  );
  const [showForm, setShowForm] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [viewImage, setViewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pending = group.expenses.filter((e) => e.status === "pending");
  const approved = group.expenses.filter((e) => e.status === "approved");

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
      files.length < all.length ? "Some files were skipped (PNG, JPG, PDF only)." : ""
    );
    try {
      if (supabase) {
        // Backend mode: upload to Supabase Storage and keep only the public
        // URLs (base64 in the DB bloats every fetch). Images are compressed to
        // JPEG; PDFs are uploaded as-is.
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
        const urls = await uploadReceipts(supabase, group.id, uploads);
        setImages((prev) => [...prev, ...urls]);
      } else {
        // Sandbox/local mode: no storage, keep receipts in memory as data URLs.
        const encoded = await Promise.all(
          files.map((f) =>
            f.type === "application/pdf"
              ? fileToDataURL(f)
              : fileToCompressedDataURL(f)
          )
        );
        setImages((prev) => [...prev, ...encoded]);
      }
    } catch {
      setUploadError("Receipt upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitExpense = () => {
    const amt = parseFloat(amount);
    if (!desc.trim() || isNaN(amt) || amt <= 0) return;
    setGroup((prev) => ({
      ...prev,
      expenses: [
        ...prev.expenses,
        {
          id: uid(),
          description: desc.trim(),
          amount: amt,
          submittedBy: currentUser.id,
          submittedByName: currentUser.name,
          status: "pending" as const,
          images: images.length > 0 ? images : undefined,
          date: new Date().toISOString(),
        },
      ],
    }));
    setDesc("");
    setAmount("");
    setImages([]);
    setShowForm(false);
  };

  const approveExpense = (id: string) => {
    setGroup((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => {
        if (e.id !== id) return e;
        const splits: Record<string, number> = {};
        const share = e.amount / prev.members.length;
        prev.members.forEach(
          (m) => (splits[m.id] = Math.round(share * 100) / 100)
        );
        return { ...e, status: "approved" as const, splits };
      }),
    }));
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ ...secTitle, marginBottom: 4 }}>Expenses</h2>
          <p style={{ fontSize: 14, color: T.secondary, margin: 0 }}>
            Requires treasurer approval
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            background: showForm ? T.bg : T.blue,
            color: showForm ? T.text : "#fff",
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ Submit"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Description</label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Toilet paper, etc."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Amount</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => {
                  if (isNonNegativeInput(e.target.value))
                    setAmount(e.target.value);
                }}
                onKeyDown={blockNegativeKeys}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Receipts</label>
            <input
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
                  key={i}
                  style={{ position: "relative", width: 64, height: 64 }}
                >
                  {isPdfReceipt(src) ? (
                    <button
                      onClick={() => setViewImage(src)}
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`Receipt ${i + 1}`}
                      onClick={() => setViewImage(src)}
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: "cover",
                        borderRadius: T.radiusSm,
                        cursor: "pointer",
                        border: `1px solid ${T.border}`,
                      }}
                    />
                  )}
                  <button
                    onClick={() => removeImage(i)}
                    aria-label="Remove receipt"
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
          <button
            onClick={submitExpense}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: T.radiusSm,
              border: "none",
              background: desc.trim() && amount ? T.blue : "#c7c7cc",
              color: "#fff",
              fontFamily: T.font,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Submit for Approval
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: T.orange,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            Pending · {pending.length}
          </h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {pending.map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 18px",
                  borderBottom:
                    i < pending.length - 1
                      ? `1px solid ${T.border}`
                      : "none",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,149,0,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 17,
                  }}
                >
                  🛒
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {e.description}
                  </div>
                  <div style={{ fontSize: 12, color: T.tertiary }}>
                    by {e.submittedByName}
                  </div>
                </div>
                <ReceiptThumbs images={e.images} onView={setViewImage} />
                <div
                  style={{
                    fontFamily: T.mono,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  ${e.amount.toFixed(2)}
                </div>
                {isTreasurer && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => approveExpense(e.id)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: "none",
                        background: T.green,
                        color: "#fff",
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={() =>
                        setGroup((prev) => ({
                          ...prev,
                          expenses: prev.expenses.map((x) =>
                            x.id === e.id
                              ? { ...x, status: "denied" as const }
                              : x
                          ),
                        }))
                      }
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: "none",
                        background: T.bg,
                        color: T.secondary,
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ✗
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {approved.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: T.green,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            Approved
          </h3>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {[...approved].reverse().map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 18px",
                  borderBottom:
                    i < approved.length - 1
                      ? `1px solid ${T.border}`
                      : "none",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(88,86,214,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 17,
                  }}
                >
                  🛒
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {e.description}
                  </div>
                  <div style={{ fontSize: 12, color: T.tertiary }}>
                    by {e.submittedByName} · $
                    {(e.amount / group.members.length).toFixed(2)}/person
                  </div>
                </div>
                <ReceiptThumbs images={e.images} onView={setViewImage} />
                <div
                  style={{
                    fontFamily: T.mono,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  ${e.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && approved.length === 0 && !showForm && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: T.tertiary,
            fontSize: 15,
          }}
        >
          No expenses yet
        </div>
      )}

      {viewImage && (
        <div
          onClick={() => setViewImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          {isPdfReceipt(viewImage) ? (
            <iframe
              src={viewImage}
              title="Receipt PDF"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: T.radius,
                boxShadow: T.shadowLg,
                background: "#fff",
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewImage}
              alt="Receipt"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                borderRadius: T.radius,
                boxShadow: T.shadowLg,
              }}
            />
          )}
          <button
            onClick={() => setViewImage(null)}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              border: "none",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: 22,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
