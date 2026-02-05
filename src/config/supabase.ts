/**
 * Supabase Client Configuration
 * Provides singleton instance for database and storage access.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./env.js";

/**
 * Supabase client singleton with service role key.
 * Use this for server-side operations that need full database access.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Storage bucket name for all media files.
 * Uses path prefixes to organize content.
 */
export const MEDIA_BUCKET = "media";


