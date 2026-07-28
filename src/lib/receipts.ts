import type { SupabaseClient } from "@supabase/supabase-js";
import { uid } from "@/lib/utils";

const BUCKET = "receipts";

/** How long a signed receipt URL stays valid, in seconds. */
const SIGNED_URL_TTL = 60 * 60;

/**
 * A receipt file ready to upload: the binary blob plus the extension and MIME
 * type to store it under (compressed images become .jpg, PDFs stay .pdf).
 */
export interface ReceiptUpload {
  blob: Blob;
  ext: string;
  contentType: string;
}

/**
 * Uploads receipt files to Supabase Storage under the group's folder
 * ({groupId}/{uuid}.{ext}) and returns the object paths.
 *
 * Paths rather than URLs: the bucket is private, so a receipt is only readable
 * through a signed URL minted on demand for someone who is still a member of
 * the group. Storing a URL would mean storing a credential that never expires.
 */
export async function uploadReceipts(
  supabase: SupabaseClient,
  groupId: string,
  uploads: ReceiptUpload[]
): Promise<string[]> {
  return Promise.all(
    uploads.map(async ({ blob, ext, contentType }) => {
      const path = `${groupId}/${uid()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType });
      if (error) throw new Error(error.message);
      return path;
    })
  );
}

/**
 * True when a reference can be handed straight to an <img>/<iframe>: sandbox
 * data URLs, and the full public URLs written before the bucket was private.
 */
export function isDirectlyViewable(ref: string): boolean {
  return ref.startsWith("data:") || /^https?:\/\//i.test(ref);
}

/**
 * Resolves stored receipt references to URLs a browser can load, keyed by the
 * original reference. Data URLs and legacy public URLs pass through untouched.
 *
 * Failures are omitted rather than thrown: one unreadable receipt shouldn't
 * stop the rest of an expense list from rendering.
 */
export async function signReceiptRefs(
  supabase: SupabaseClient,
  refs: string[]
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const paths: string[] = [];

  for (const ref of refs) {
    if (isDirectlyViewable(ref)) resolved[ref] = ref;
    else if (!paths.includes(ref)) paths.push(ref);
  }

  if (paths.length === 0) return resolved;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) return resolved;

  (data ?? []).forEach((entry, i) => {
    const url = entry?.signedUrl;
    if (url) resolved[paths[i]] = url;
  });
  return resolved;
}

/** True when a receipt reference points at a PDF rather than an image. */
export function isPdfReceipt(ref: string): boolean {
  return /\.pdf(?:$|\?)/i.test(ref) || ref.startsWith("data:application/pdf");
}
