/**
 * Delete videos with discovered, processing, or failed status
 * Run with: pnpm exec tsx src/scripts/deleteUnprocessedVideos.ts
 * 
 * WARNING: This permanently deletes video records from the database!
 * Only videos with status "discovered", "processing", or "failed" will be deleted.
 * Videos with status "processed" (successfully completed) will NOT be touched.
 */

import "dotenv/config";
import { supabase } from "../config/supabase.js";

async function deleteUnprocessedVideos() {
  console.log("⚠️  WARNING: This will permanently delete video records!\n");
  console.log("Deleting videos with status: discovered, processing, or failed...\n");

  try {
    // 1. Get count of discovered videos
    const { count: discoveredCount, error: discoveredError } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("status", "discovered");

    if (discoveredError) {
      throw new Error(`Failed to count discovered videos: ${discoveredError.message}`);
    }

    console.log(`Found ${discoveredCount} discovered videos`);

    // 2. Get count of processing videos
    const { count: processingCount, error: processingError } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing");

    if (processingError) {
      throw new Error(`Failed to count processing videos: ${processingError.message}`);
    }

    console.log(`Found ${processingCount} processing videos`);

    // 3. Get count of failed videos
    const { count: failedCount, error: failedError } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    if (failedError) {
      throw new Error(`Failed to count failed videos: ${failedError.message}`);
    }

    console.log(`Found ${failedCount} failed videos`);

    const totalToDelete = (discoveredCount || 0) + (processingCount || 0) + (failedCount || 0);
    
    if (totalToDelete === 0) {
      console.log("\nNo videos to delete. Exiting.");
      process.exit(0);
    }

    console.log(`\nTotal videos to delete: ${totalToDelete}`);

    // 4. Delete all videos with these statuses in one query
    console.log("\nDeleting videos...");
    const { error: deleteError } = await supabase
      .from("videos")
      .delete()
      .in("status", ["discovered", "processing", "failed"]);

    if (deleteError) {
      throw new Error(`Failed to delete videos: ${deleteError.message}`);
    }

    console.log(`✓ Deleted ${totalToDelete} videos`);

    // 5. Verify deletion
    const { count: remainingCount, error: verifyError } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .in("status", ["discovered", "processing", "failed"]);

    if (verifyError) {
      throw new Error(`Failed to verify deletion: ${verifyError.message}`);
    }

    console.log(`\n✓ Verification: ${remainingCount} unprocessed videos remaining (should be 0)`);

    // 6. Show remaining processed videos
    const { count: processedCount, error: processedError } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("status", "processed");

    if (processedError) {
      throw new Error(`Failed to count processed videos: ${processedError.message}`);
    }

    console.log(`✓ Successfully processed videos preserved: ${processedCount}`);

    console.log("\n✓ Cleanup complete!");

  } catch (error) {
    console.error("\n✗ Error during deletion:", error);
    process.exit(1);
  }

  process.exit(0);
}

deleteUnprocessedVideos();
