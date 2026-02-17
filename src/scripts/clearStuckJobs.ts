/**
 * Emergency Script: Clear Stuck Jobs from Queue
 * 
 * This script removes stuck/stalled jobs from the BullMQ queue
 * to free up worker capacity for new jobs.
 * 
 * Use this when:
 * - Videos stuck at certain percentages (e.g., 5% download)
 * - Workers appear hung/frozen
 * - Queue blocked by stalled jobs
 */

import "dotenv/config";
import { queues } from "../config/queues.js";

async function clearStuckJobs() {
  console.log("🔍 Analyzing queue state...\n");

  try {
    // Get all job states
    const [waiting, active, delayed, failed, completed] = await Promise.all([
      queues.processVideo.getJobs(["waiting"]),
      queues.processVideo.getJobs(["active"]),
      queues.processVideo.getJobs(["delayed"]),
      queues.processVideo.getJobs(["failed"]),
      queues.processVideo.getJobs(["completed"], 0, 10), // Only recent 10
    ]);

    console.log("📊 Queue Statistics:");
    console.log(`  - Waiting: ${waiting.length} jobs`);
    console.log(`  - Active: ${active.length} jobs`);
    console.log(`  - Delayed: ${delayed.length} jobs`);
    console.log(`  - Failed: ${failed.length} jobs`);
    console.log(`  - Recently Completed: ${completed.length} jobs\n`);

    // Check for stuck active jobs (active for > 10 minutes)
    const now = Date.now();
    const stuckThresholdMs = 10 * 60 * 1000; // 10 minutes
    
    console.log("🔎 Analyzing active jobs for stuck processes...\n");
    const stuckJobs = active.filter((job) => {
      const processedOn = job.processedOn || 0;
      const elapsedMs = now - processedOn;
      if (elapsedMs > stuckThresholdMs) {
        const elapsedMin = Math.floor(elapsedMs / 60000);
        console.log(`  ⚠️  Job ${job.id} stuck for ${elapsedMin} minutes`);
        return true;
      }
      return false;
    });

    if (stuckJobs.length === 0) {
      console.log("  ✅ No stuck jobs found! All active jobs are progressing normally.\n");
    } else {
      console.log(`\n  Found ${stuckJobs.length} stuck job(s)\n`);
    }

    // Show what videos are stuck (if any)
    if (active.length > 0) {
      console.log("📹 Currently active videos:");
      for (const job of active) {
        const progress = (job.progress as any) || {};
        const videoId = job.data?.youtubeVideoId || job.id;
        const title = job.data?.title || "Unknown";
        console.log(`  - ${videoId}: ${title}`);
        console.log(`    Progress: ${progress.progress || 0}%`);
        console.log(`    Status: ${progress.status || "Unknown"}`);
        console.log(`    Processing time: ${Math.floor((now - (job.processedOn || now)) / 60000)} minutes\n`);
      }
    }

    // Ask for confirmation before cleanup
    if (stuckJobs.length === 0 && failed.length === 0 && active.length === 0) {
      console.log("✅ Queue is clean! Nothing to clear.\n");
      process.exit(0);
    }

    console.log("🧹 CLEANUP OPTIONS:\n");
    console.log("This script can remove:");
    console.log(`  - ${stuckJobs.length} stuck active jobs (processing > 10 min)`);
    console.log(`  - ${failed.length} failed jobs (to allow retry)`);
    console.log(`  - ${active.length} all active jobs (if truly stalled)\n`);

    console.log("⚠️  WARNING: This will cancel in-progress processing!");
    console.log("Videos will return to 'discovered' status and can be re-enqueued.\n");

    // For now, just remove stuck and failed jobs automatically
    // User can uncomment below to make it interactive
    const shouldClean = true; // Set to false to require manual confirmation

    if (!shouldClean) {
      console.log("❌ Cleanup cancelled by user.\n");
      process.exit(0);
    }

    // Remove stuck jobs
    console.log("\n🧹 Starting cleanup...\n");
    let removedCount = 0;

    for (const job of stuckJobs) {
      try {
        await job.remove();
        removedCount++;
        console.log(`  ✅ Removed stuck job: ${job.id}`);
      } catch (err) {
        console.error(`  ❌ Failed to remove job ${job.id}:`, err);
      }
    }

    // Remove failed jobs (so they can be retried)
    for (const job of failed) {
      try {
        await job.remove();
        removedCount++;
        console.log(`  ✅ Removed failed job: ${job.id}`);
      } catch (err) {
        console.error(`  ❌ Failed to remove job ${job.id}:`, err);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ CLEANUP COMPLETE");
    console.log("=".repeat(60));
    console.log(`Removed ${removedCount} jobs from queue`);
    console.log("\n💡 Next steps:");
    console.log("1. Run: npm run script:enqueue-discovered");
    console.log("2. Monitor workers: flyctl logs -a church-media-automation");
    console.log("=".repeat(60) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  }
}

// Run the script
clearStuckJobs();
