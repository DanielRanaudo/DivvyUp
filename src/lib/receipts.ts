import type { SupabaseClient } from "@supabase/supabase-js";
import { uid } from "@/lib/utils";

const BUCKET = "receipts";

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
 * ({groupId}/{uuid}.{ext}, e.g. .jpg or .pdf — storage RLS checks group
 * membership on the folder
 * name) and returns their public URLs, which are stored on the expense row
 * instead of base64 data.
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
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return data.publicUrl;
    })
  );
}
