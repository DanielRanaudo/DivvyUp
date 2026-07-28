import type { SupabaseClient } from "@supabase/supabase-js";
import { uid } from "@/lib/utils";

const BUCKET = "avatars";

/** Avatars render at most ~56px, so this is plenty and keeps uploads small. */
export const AVATAR_MAX_DIM = 512;

/**
 * Uploads a profile picture to Supabase Storage under the user's own folder
 * ({userId}/{uuid}.jpg — storage RLS only allows writes inside your folder)
 * and returns its public URL, which is stored on the profile and membership
 * rows instead of base64 data.
 *
 * A fresh filename is used on every upload so cached copies of a previous
 * picture are never served in place of the new one.
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  blob: Blob
): Promise<string> {
  const path = `${userId}/${uid()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
