/**
 * Clean stuck jobs from the queue
 * Run with: tsx src/scripts/cleanStuckJobs.ts
 */

import "dotenv/config";
import { queues } from "../config/queues.js";

async function cleanStuckJobs() {
  console.log("Checking for stuck jobs...");

  const jobIds = [
    "d2a3c5eb-4c59-4a76-91c0-cc785386cb6c_TMNk7ow0570",
    "d2a3c5eb-4c59-4a76-91c0-cc785386cb6c_hr0WXvEJ4gY",
  ];

  for (const jobId of jobIds) {
    const job = await queues.processVideo.getJob(jobId);
    
    if (job) {
      const state = await job.getState();
      console.log(`Job ${jobId}: state=${state}`);

      if (state === "active") {
        try {
          // Force move from active to failed, then remove
          await job.moveToFailed(new Error("Cleaning stale job"), "0", true);
          await job.remove();
          console.log(`  ✓ Removed stale active job ${jobId}`);
        } catch (err) {
          console.error(`  ✗ Failed to remove ${jobId}:`, err);
        }
      } else {
        console.log(`  Job is ${state}, no action needed`);
      }
    } else {
      console.log(`Job ${jobId}: not found`);
    }
  }

  console.log("\nDone! Restart the server to re-enqueue.");
  process.exit(0);
}

cleanStuckJobs().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
