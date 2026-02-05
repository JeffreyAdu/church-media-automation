/**
 * Storage Setup
 * Handles storage bucket creation and verification.
 */

import { supabase, MEDIA_BUCKET } from "./supabase.js";

/**
 * Creates a storage bucket if it doesn't already exist.
 * Idempotent operation - safe to call multiple times.
 */
async function ensureBucket(bucketName: string, isPublic = false): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();

  const exists = buckets?.some((bucket) => bucket.name === bucketName);

  if (!exists) {
    const { error } = await supabase.storage.createBucket(bucketName, {
      public: isPublic,
    });

    if (error) {
      throw new Error(`Failed to create bucket ${bucketName}: ${error.message}`);
    }

    console.log(`✓ Created storage bucket: ${bucketName}`);
  } else {
    console.log(`✓ Storage bucket exists: ${bucketName}`);
  }
}

/**
 * Ensures required storage buckets exist.
 */
export async function ensureStorageBuckets(): Promise<void> {
  // Create single media bucket with public access for processed audio and artwork
  // Raw audio files are private by default through RLS policies
  await ensureBucket(MEDIA_BUCKET, true);
}
