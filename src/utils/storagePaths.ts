/**
 * Storage path utilities for consistent file organization.
 * Structure: media/raw|processed|intro|outro|artwork/agents/{agentId}/...
 */
export const StoragePaths = {
  /** Raw audio from YouTube download: agents/{agentId}/videos/{videoId}.m4a */
  raw: (agentId: string, videoId: string) => 
    `raw/agents/${agentId}/videos/${videoId}.m4a`,
  
  /** Final podcast audio: agents/{agentId}/episodes/{episodeId}.mp3 */
  processed: (agentId: string, episodeId: string) => 
    `processed/agents/${agentId}/episodes/${episodeId}.mp3`,
  
  /** Church-specific intro: agents/{agentId}/intro.mp3 */
  intro: (agentId: string) => 
    `intro/agents/${agentId}/intro.mp3`,
  
  /** Church-specific outro: agents/{agentId}/outro.mp3 */
  outro: (agentId: string) => 
    `outro/agents/${agentId}/outro.mp3`,
  
  /** Podcast artwork: agents/{agentId}/cover.jpg */
  artwork: (agentId: string) => 
    `artwork/agents/${agentId}/cover.jpg`,
} as const;
