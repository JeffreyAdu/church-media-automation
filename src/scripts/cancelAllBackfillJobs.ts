/**
 * Cancel all active backfill jobs
 * Run with: pnpm run script:cancel-backfills
 */

import "dotenv/config";
import { supabase } from "../config/database.js";

async function cancelAllBackfillJobs() {
  console.log("Cancelling all active backfill jobs...");

  try {
    // Get current active jobs
    const { data: activeBefore, error: fetchError } = await supabase
      .from("backfill_jobs")
      .select("jobid, status, created_at")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false });

    if (fetchError) throw fetchError;

    console.log(`\nFound ${activeBefore?.length || 0} active jobs to cancel`);
    
    if (activeBefore && activeBefore.length > 0) {
      activeBefore.forEach((job) => {
        console.log(`  - ${job.jobid.slice(0, 8)}... (${job.status})`);
      });
    }

    // Cancel all pending/processing jobs
    const { data, error } = await supabase
      .from("backfill_jobs")
      .update({
        status: "cancelled",
        error: "Manually cancelled via script",
        updated_at: new Date().toISOString(),
      })
      .in("status", ["pending", "processing"])
      .select();

    if (error) throw error;

    console.log(`\n✓ Successfully cancelled ${data?.length || 0} backfill jobs`);

    // Verify cancellation
    const { data: activeAfter } = await supabase
      .from("backfill_jobs")
      .select("status")
      .in("status", ["pending", "processing"]);

    console.log(`\nRemaining active jobs: ${activeAfter?.length || 0}`);
    console.log("\n✓ All active backfill jobs have been cancelled");
  } catch (error) {
    console.error("Error cancelling backfill jobs:", error);
    process.exit(1);
  }

  process.exit(0);
}

cancelAllBackfillJobs();
