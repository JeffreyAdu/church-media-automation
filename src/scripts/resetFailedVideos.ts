/**
 * Reset failed and stuck videos in Supabase
 * Run with: pnpm exec tsx src/scripts/resetFailedVideos.ts
 * 
 * This script:
 * 1. Resets "failed" videos to "discovered" status
 * 2. Resets stuck "processing" videos to "discovered" status
 * 3. Clears error messages
 */

import "dotenv/config";
import { supabase } from "../config/supabase.js";

async function resetFailedVideos() {
  console.log("Resetting failed and stuck videos in Supabase...\n");

  try {
    // 1. Get count of failed videos
    const { count: failedCount, error: failedError } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    if (failedError) {
      throw new Error(`Failed to count failed videos: ${failedError.message}`);
    }

    console.log(`Found ${failedCount} failed videos`);

    // 2. Get count of stuck processing videos
    const { count: processingCount, error: processingError } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing");

    if (processingError) {
      throw new Error(`Failed to count processing videos: ${processingError.message}`);
    }

    console.log(`Found ${processingCount} stuck processing videos`);

    // 3. Reset failed videos to "discovered" status
    if (failedCount && failedCount > 0) {
      console.log("\nResetting failed videos to 'discovered' status...");
      const { error: resetFailedError } = await supabase
        .from("videos")
        .update({
          status: "discovered",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("status", "failed");

      if (resetFailedError) {
        throw new Error(`Failed to reset failed videos: ${resetFailedError.message}`);
      }

      console.log(`✓ Reset ${failedCount} failed videos`);
    }

    // 4. Reset stuck processing videos to "discovered" status
    if (processingCount && processingCount > 0) {
      console.log("\nResetting stuck processing videos to 'discovered' status...");
      const { error: resetProcessingError } = await supabase
        .from("videos")
        .update({
          status: "discovered",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("status", "processing");

      if (resetProcessingError) {
        throw new Error(`Failed to reset processing videos: ${resetProcessingError.message}`);
      }

      console.log(`✓ Reset ${processingCount} stuck processing videos`);
    }

    // 5. Summary
    const totalReset = (failedCount || 0) + (processingCount || 0);
    console.log(`\n✓ Total videos reset: ${totalReset}`);
    console.log("\nAll videos are now in 'discovered' status and ready to be re-enqueued.");
    console.log("Run 'pnpm run script:enqueue-discovered' to queue them for processing.");

  } catch (error) {
    console.error("Error resetting videos:", error);
    process.exit(1);
  }

  process.exit(0);
}

resetFailedVideos();
