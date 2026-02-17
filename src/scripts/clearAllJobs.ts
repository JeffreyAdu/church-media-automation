/**
 * Clear all jobs from the processVideo queue
 * Run with: tsx src/scripts/clearAllJobs.ts
 */

import "dotenv/config";
import { queues } from "../config/queues.js";

async function clearAllJobs() {
  console.log("Clearing all jobs from processVideo queue...");

  try {
    // Get counts before cleanup
    const waiting = await queues.processVideo.getWaitingCount();
    const active = await queues.processVideo.getActiveCount();
    const delayed = await queues.processVideo.getDelayedCount();
    const failed = await queues.processVideo.getFailedCount();
    const completed = await queues.processVideo.getCompletedCount();

    console.log("\nBefore cleanup:");
    console.log(`  Waiting: ${waiting}`);
    console.log(`  Active: ${active}`);
    console.log(`  Delayed: ${delayed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Completed: ${completed}`);
    console.log(`  Total: ${waiting + active + delayed + failed + completed}`);

    // Clean all job types
    console.log("\nCleaning jobs...");
    
    await queues.processVideo.clean(0, 1000, "completed");
    console.log("  ✓ Cleaned completed jobs");
    
    await queues.processVideo.clean(0, 1000, "failed");
    console.log("  ✓ Cleaned failed jobs");
    
    await queues.processVideo.clean(0, 1000, "active");
    console.log("  ✓ Cleaned active jobs");
    
    await queues.processVideo.clean(0, 1000, "delayed");
    console.log("  ✓ Cleaned delayed jobs");
    
    await queues.processVideo.clean(0, 1000, "wait");
    console.log("  ✓ Cleaned waiting jobs");

    // Obliterate everything (nuclear option)
    await queues.processVideo.obliterate({ force: true });
    console.log("  ✓ Obliterated queue");

    // Get counts after cleanup
    const waitingAfter = await queues.processVideo.getWaitingCount();
    const activeAfter = await queues.processVideo.getActiveCount();
    const delayedAfter = await queues.processVideo.getDelayedCount();
    const failedAfter = await queues.processVideo.getFailedCount();
    const completedAfter = await queues.processVideo.getCompletedCount();

    console.log("\nAfter cleanup:");
    console.log(`  Waiting: ${waitingAfter}`);
    console.log(`  Active: ${activeAfter}`);
    console.log(`  Delayed: ${delayedAfter}`);
    console.log(`  Failed: ${failedAfter}`);
    console.log(`  Completed: ${completedAfter}`);
    console.log(`  Total: ${waitingAfter + activeAfter + delayedAfter + failedAfter + completedAfter}`);

    console.log("\n✓ All jobs cleared successfully");
  } catch (error) {
    console.error("Error clearing jobs:", error);
    process.exit(1);
  }

  process.exit(0);
}

clearAllJobs();
