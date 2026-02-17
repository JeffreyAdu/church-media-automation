/**
 * Emergency Script: Enqueue all discovered videos
 * 
 * This script finds all videos with status="discovered" and enqueues them
 * for processing without calling the YouTube API.
 * 
 * Use this when:
 * - Videos are stuck in "discovered" status
 * - YouTube API quota exhausted
 * - Need to bypass backfill scan and go straight to processing
 */

import "dotenv/config";
import { supabase } from "../config/supabase.js";
import { enqueueProcessVideo } from "../services/external/queue/enqueueProcessVideo.js";

interface DiscoveredVideo {
  id: string;
  agent_id: string;
  youtube_video_id: string;
  youtube_url: string;
  title: string | null;
  published_at: string | null;
}

async function enqueueDiscoveredVideos() {
  console.log("🔍 Finding all discovered videos...\n");

  // Fetch all videos with status="discovered"
  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, agent_id, youtube_video_id, youtube_url, title, published_at")
    .eq("status", "discovered")
    .order("published_at", { ascending: true }); // Oldest first

  if (error) {
    console.error("❌ Failed to fetch discovered videos:", error);
    process.exit(1);
  }

  if (!videos || videos.length === 0) {
    console.log("✅ No discovered videos found. All videos have been processed!");
    process.exit(0);
  }

  console.log(`📊 Found ${videos.length} discovered videos\n`);

  // Group by agent for reporting
  const byAgent = videos.reduce((acc, v) => {
    acc[v.agent_id] = (acc[v.agent_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("Videos per agent:");
  for (const [agentId, count] of Object.entries(byAgent)) {
    console.log(`  - Agent ${agentId}: ${count} videos`);
  }
  console.log();

  // Enqueue all videos
  let enqueuedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  console.log("🚀 Starting to enqueue videos...\n");

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const progress = `[${i + 1}/${videos.length}]`;

    try {
      const result = await enqueueProcessVideo({
        agentId: video.agent_id,
        youtubeVideoId: video.youtube_video_id,
        youtubeUrl: video.youtube_url,
        title: video.title || undefined,
      });

      if (result.enqueued) {
        enqueuedCount++;
        console.log(`${progress} ✅ Enqueued: ${video.title || video.youtube_video_id}`);
      } else {
        skippedCount++;
        console.log(`${progress} ⏭️  Skipped: ${video.title || video.youtube_video_id} (already in queue)`);
      }
    } catch (err) {
      errorCount++;
      console.error(`${progress} ❌ Error: ${video.youtube_video_id}:`, err);
    }

    // Progress update every 10 videos
    if ((i + 1) % 10 === 0) {
      console.log(`\n📈 Progress: ${i + 1}/${videos.length} processed (${enqueuedCount} enqueued, ${skippedCount} skipped, ${errorCount} errors)\n`);
    }
  }

  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 FINAL SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total discovered videos: ${videos.length}`);
  console.log(`✅ Successfully enqueued: ${enqueuedCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log("=".repeat(60));

  if (enqueuedCount > 0) {
    console.log("\n🎉 Videos enqueued! Workers will start processing them now.");
    console.log("💡 Monitor progress in the frontend or check worker logs with:");
    console.log("   flyctl logs -a church-media-automation");
  } else {
    console.log("\n⚠️  No videos were enqueued. Check the errors above.");
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

// Run the script
enqueueDiscoveredVideos().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
