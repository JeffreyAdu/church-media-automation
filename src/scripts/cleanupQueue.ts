/**
 * Cleanup Script
 * Flushes queue jobs and deletes unpublished draft episodes
 */

import "dotenv/config";
import { queues } from "../config/queues.js";
import { supabase } from "../config/supabase.js";

async function cleanupQueue() {
  console.log("[cleanup] Starting cleanup process...");
  
  // 1. Flush all jobs from processVideo queue
  console.log("[cleanup] Flushing queue jobs...");
  
  const queue = queues.processVideo;
  
  // Get counts before deletion
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  
  console.log("[cleanup] Current queue state:");
  console.log(`  - Waiting: ${waiting}`);
  console.log(`  - Active: ${active}`);
  console.log(`  - Completed: ${completed}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Delayed: ${delayed}`);
  console.log(`  - Total: ${waiting + active + completed + failed + delayed}`);
  
  // Obliterate removes ALL jobs (waiting, active, completed, failed, delayed)
  await queue.obliterate({ force: true });
  
  console.log("[cleanup] ✓ Queue cleared");
  
  // 2. Delete unpublished episodes from database
  console.log("[cleanup] Deleting unpublished episodes...");
  
  const { data: episodes, error: episodesError } = await supabase
    .from("episodes")
    .delete()
    .eq("published", false)
    .select("id, title, agent_id");
  
  if (episodesError) {
    console.error("[cleanup] Error deleting episodes:", episodesError);
  } else {
    console.log(`[cleanup] ✓ Deleted ${episodes?.length || 0} unpublished episodes:`);
    episodes?.forEach((row: any) => {
      console.log(`  - ${row.title} (${row.id})`);
    });
  }
  
  // 3. Reset video processing status to allow re-processing
  console.log("[cleanup] Resetting video processing status...");
  
  const { data: videos, error: videosError } = await supabase
    .from("videos")
    .update({
      status: "discovered",
      error_message: null,
    })
    .in("status", ["processing", "failed", "processed"])
    .select("id, youtube_video_id");
  
  if (videosError) {
    console.error("[cleanup] Error resetting videos:", videosError);
  } else {
    console.log(`[cleanup] ✓ Reset ${videos?.length || 0} videos to pending`);
  }
  
  console.log("[cleanup] ✅ Cleanup complete!");
  
  process.exit(0);
}

cleanupQueue().catch((error) => {
  console.error("[cleanup] ✗ Error:", error);
  process.exit(1);
});
