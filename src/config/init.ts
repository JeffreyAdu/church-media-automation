/**
 * Application Initialization
 * Ensures storage buckets exist on startup.
 * 
 * Note: Schema migrations should be run separately via:
 *   npx supabase db push
 */

import { ensureStorageBuckets } from "./storage.js";


/**
 * Initializes application dependencies on startup.
 */
export async function initializeApp(): Promise<void> {
  console.log("Initializing application...");

  try {
    // Ensure storage buckets exist
    await ensureStorageBuckets();

    console.log("✓ Application initialized successfully\n");
  } catch (error) {
    console.error("✗ Application initialization failed:", error);
    throw error;
  }
}
