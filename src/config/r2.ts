/**
 * Cloudflare R2 Client
 * R2 is S3-compatible — uses AWS SDK with a custom endpoint.
 * All media storage (episodes, artwork, intro/outro) lives here.
 * Supabase is DB-only.
 */

import { S3Client } from "@aws-sdk/client-s3";

if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID");
if (!process.env.R2_ACCESS_KEY_ID) throw new Error("Missing R2_ACCESS_KEY_ID");
if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error("Missing R2_SECRET_ACCESS_KEY");
if (!process.env.R2_PUBLIC_URL) throw new Error("Missing R2_PUBLIC_URL");

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? "media";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
