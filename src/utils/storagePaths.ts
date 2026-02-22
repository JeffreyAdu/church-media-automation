/**
 * Storage path utilities for consistent R2 key organization.
 * Structure: processed|intro|outro|artwork/agents/{agentId}/...
 */
export const StoragePaths = {
  /** Final podcast episode: processed/agents/{agentId}/episodes/{episodeKey}.mp3
   *  episodeKey is typically the youtubeVideoId (available before DB record is created) */
  processed: (agentId: string, episodeKey: string) =>
    `processed/agents/${agentId}/episodes/${episodeKey}.mp3`,

  /** Organization-specific intro: intro/agents/{agentId}/intro.mp3 */
  intro: (agentId: string) =>
    `intro/agents/${agentId}/intro.mp3`,

  /** Organization-specific outro: outro/agents/{agentId}/outro.mp3 */
  outro: (agentId: string) =>
    `outro/agents/${agentId}/outro.mp3`,

  /** Podcast artwork: artwork/agents/{agentId}/cover.jpg */
  artwork: (agentId: string) =>
    `artwork/agents/${agentId}/cover.jpg`,
} as const;
