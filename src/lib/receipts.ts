import type { SupabaseClient } from "@supabase/supabase-js";
import { uid } from "@/lib/utils";

const BUCKET = "receipts";

/**
 * Uploads compressed receipt images to Supabase Storage under the group's
 * folder ({groupId}/{uuid}.jpg — storage RLS checks group membership on the
 * folder name) and returns their public URLs, which are stored on the
 * expense row instead of base64 data.
 */
export async function uploadReceipts(
  supabase: SupabaseClient,
  groupId: string,
  blobs: Blob[]
): Promise<string[]> {
  return Promise.all(
    blobs.map(async (blob) => {
      const path = `${groupId}/${uid()}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return data.publicUrl;
    })
  );
}
