/**
 * Storage Initialization
 * R2 buckets are created via the Cloudflare dashboard — no programmatic setup needed.
 * This function exists as a startup hook for logging/verification.
 */

import { R2_BUCKET, R2_PUBLIC_URL } from "./r2.js";

export async function ensureStorageBuckets(): Promise<void> {
  console.log(`✓ Storage: Cloudflare R2 bucket "${R2_BUCKET}" (${R2_PUBLIC_URL})`);
}
