/**
 * Agent Service
 * Business logic for agent management and WebSub subscriptions.
 */

import { subscribe, unsubscribe, buildTopic } from "../external/websub.js";
import { websubConfig } from "../../config/websub.js";
import { uploadFileFromBuffer, deleteFile } from "../external/storage.js";
import { StoragePaths } from "../../utils/storagePaths.js";
import {
  createAgent as createAgentRepo,
  findById,
  findAll,
  findByUserId,
  updateAgent as updateAgentRepo,
  deleteAgent as deleteAgentRepo,
  type Agent,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "../../repositories/agentRepository.js";
import { findEpisodesByAgentId, type Episode } from "../../repositories/episodeRepository.js";
import { NotFoundError } from "../../utils/errors.js";
import { resolveChannelId } from "../external/youtube.js";
import { processPodcastArtwork } from "../../utils/imageProcessing.js";

/**
 * Gets an agent by ID (verifies user ownership).
 */
export async function getAgent(agentId: string, userId: string): Promise<Agent | null> {
  const agent = await findById(agentId);
  if (agent && agent.user_id !== userId) {
    return null; // User doesn't own this agent
  }
  return agent;
}

/**
 * Creates a new agent and subscribes to its YouTube channel via WebSub.
 */
type CreateAgentRequest = Omit<CreateAgentInput, "youtube_channel_id"> & {
  youtube_channel_url: string;
};

export async function createAgent(
  input: CreateAgentRequest,
  callbackUrl: string
): Promise<Agent> {
  const channelId = await resolveChannelId(input.youtube_channel_url);

  // Create agent record
  const agent = await createAgentRepo({ ...input, youtube_channel_id: channelId });

  try {
    // Subscribe to YouTube channel updates
    await subscribe(agent.youtube_channel_id, callbackUrl);
    
    // Calculate expiration time (lease seconds minus 1 hour buffer for renewal)
    const expiresAt = new Date(Date.now() + (websubConfig.leaseSeconds - 3600) * 1000);
    const topic = buildTopic(agent.youtube_channel_id);
    
    // Save subscription metadata
    await updateAgentRepo(agent.id, {
      websub_topic_url: topic,
      websub_callback_url: callbackUrl,
      websub_lease_seconds: websubConfig.leaseSeconds,
      websub_expires_at: expiresAt.toISOString(),
      websub_status: "subscribed",
    } as any);
    
    console.log(`✓ Subscribed to channel ${agent.youtube_channel_id} (expires ${expiresAt.toISOString()})`);
  } catch (error) {
    console.error(`Failed to subscribe to channel ${agent.youtube_channel_id}:`, error);
    // Mark subscription as failed
    await updateAgentRepo(agent.id, {
      websub_status: "error",
    } as any);
  }

  return await findById(agent.id) as Agent;
}

/**
 * Gets all episodes for an agent.
 */
export async function getEpisodes(agentId: string): Promise<Episode[]> {
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }
  return await findEpisodesByAgentId(agentId);
}

/**
 * Lists all agents.
 */
/**
 * Lists all agents for a specific user.
 */
export async function listAgents(userId: string): Promise<Agent[]> {
  return await findByUserId(userId);
}

/**
 * Updates an agent.
 * If status changes to paused, unsubscribes from WebSub.
 * If status changes to active, re-subscribes.
 */
export async function updateAgent(
  id: string,
  input: UpdateAgentInput,
  callbackUrl: string
): Promise<Agent> {
  const existing = await findById(id);
  if (!existing) {
    throw new NotFoundError("Agent", id);
  }

  const updated = await updateAgentRepo(id, input);

  // Handle status changes
  if (input.status === "paused" && existing.status === "active") {
    try {
      await unsubscribe(updated.youtube_channel_id, callbackUrl);
      await updateAgentRepo(id, { websub_status: "expired" } as any);
      console.log(`✓ Unsubscribed from channel ${updated.youtube_channel_id}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from channel:`, error);
    }
  } else if (input.status === "active" && existing.status === "paused") {
    try {
      await subscribe(updated.youtube_channel_id, callbackUrl);
      
      const expiresAt = new Date(Date.now() + (websubConfig.leaseSeconds - 3600) * 1000);
      const topic = buildTopic(updated.youtube_channel_id);
      
      await updateAgentRepo(id, {
        websub_topic_url: topic,
        websub_callback_url: callbackUrl,
        websub_lease_seconds: websubConfig.leaseSeconds,
        websub_expires_at: expiresAt.toISOString(),
        websub_status: "subscribed",
      } as any);
      
      console.log(`✓ Re-subscribed to channel ${updated.youtube_channel_id}`);
    } catch (error) {
      console.error(`Failed to re-subscribe to channel:`, error);
    }
  }

  return updated;
}

/**
 * Deletes an agent and unsubscribes from its channel.
 */
export async function deleteAgent(id: string, callbackUrl: string): Promise<void> {
  const agent = await findById(id);
  if (!agent) {
    throw new NotFoundError("Agent", id);
  }

  // Unsubscribe from channel first
  try {
    await unsubscribe(agent.youtube_channel_id, callbackUrl);
    console.log(`✓ Unsubscribed from channel ${agent.youtube_channel_id}`);
  } catch (error) {
    console.error(`Failed to unsubscribe from channel:`, error);
    // Continue with deletion even if unsubscribe fails
  }

  await deleteAgentRepo(id);
}

/**
 * Manually activates/renews an agent's WebSub subscription.
 * Useful for:
 * - Manually renewing a subscription before it expires
 * - Re-activating an agent with a failed subscription
 * - Recovering from subscription errors
 */
export async function activateAgent(id: string, callbackUrl: string): Promise<Agent> {
  const agent = await findById(id);
  if (!agent) {
    throw new NotFoundError("Agent", id);
  }

  try {
    // Re-subscribe (renewal = re-subscribe in WebSub)
    await subscribe(agent.youtube_channel_id, callbackUrl);
    
    // Calculate new expiration time
    const expiresAt = new Date(Date.now() + (websubConfig.leaseSeconds - 3600) * 1000);
    const topic = buildTopic(agent.youtube_channel_id);
    
    // Update subscription metadata
    await updateAgentRepo(id, {
      websub_topic_url: topic,
      websub_callback_url: callbackUrl,
      websub_lease_seconds: websubConfig.leaseSeconds,
      websub_expires_at: expiresAt.toISOString(),
      websub_status: "subscribed",
      status: "active", // Ensure agent is active
    } as any);
    
    console.log(`✓ Manually activated subscription for channel ${agent.youtube_channel_id}`);
    
    return await findById(id) as Agent;
  } catch (error) {
    console.error(`Failed to activate agent ${id}:`, error);
    await updateAgentRepo(id, { websub_status: "error" } as any);
    throw new Error(`Failed to activate agent: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Uploads an intro audio file for an agent.
 */
export async function uploadIntro(agentId: string, buffer: Buffer): Promise<string> {
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  // Delete old intro if exists
  if (agent.intro_audio_url) {
    const oldPath = StoragePaths.intro(agentId);
    await deleteFile(oldPath).catch(() => {}); // Ignore errors if file doesn't exist
  }

  // Upload new intro
  const storagePath = StoragePaths.intro(agentId);
  const upload = await uploadFileFromBuffer(buffer, storagePath, "audio/mpeg");

  // Update agent record with new URL
  await updateAgentRepo(agentId, {
    intro_audio_url: upload.publicUrl,
  });

  return upload.publicUrl;
}

/**
 * Uploads an outro audio file for an agent.
 */
export async function uploadOutro(agentId: string, buffer: Buffer): Promise<string> {
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  // Delete old outro if exists
  if (agent.outro_audio_url) {
    const oldPath = StoragePaths.outro(agentId);
    await deleteFile(oldPath).catch(() => {}); // Ignore errors if file doesn't exist
  }

  // Upload new outro
  const storagePath = StoragePaths.outro(agentId);
  const upload = await uploadFileFromBuffer(buffer, storagePath, "audio/mpeg");

  // Update agent record with new URL
  await updateAgentRepo(agentId, {
    outro_audio_url: upload.publicUrl,
  });

  return upload.publicUrl;
}

/**
 * Deletes the intro audio file for an agent.
 */
export async function deleteIntro(agentId: string): Promise<void> {
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  if (!agent.intro_audio_url) {
    return; // Nothing to delete
  }

  // Delete from storage
  const storagePath = StoragePaths.intro(agentId);
  await deleteFile(storagePath);

  // Update agent record
  await updateAgentRepo(agentId, {
    intro_audio_url: null,
  });
}

/**
 * Deletes the outro audio file for an agent.
 */
export async function deleteOutro(agentId: string): Promise<void> {
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  if (!agent.outro_audio_url) {
    return; // Nothing to delete
  }

  // Delete from storage
  const storagePath = StoragePaths.outro(agentId);
  await deleteFile(storagePath);

  // Update agent record
  await updateAgentRepo(agentId, {
    outro_audio_url: null,
  });
}

/**
 * Uploads artwork for an agent.
 * Spotify requires 1400x1400 to 3000x3000 pixels.
 * Automatically validates, crops to square, and resizes if needed.
 */
export async function uploadArtwork(agentId: string, buffer: Buffer): Promise<string> {
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  // Process artwork: validate, crop to square, resize to meet requirements
  const processedBuffer = await processPodcastArtwork(buffer);

  // Delete old artwork if exists
  if (agent.podcast_artwork_url) {
    const oldPath = StoragePaths.artwork(agentId);
    await deleteFile(oldPath).catch(() => {}); // Ignore errors if file doesn't exist
  }

  // Upload new artwork
  const storagePath = StoragePaths.artwork(agentId);
  const upload = await uploadFileFromBuffer(processedBuffer, storagePath, "image/jpeg");

  // Update agent record with new URL
  await updateAgentRepo(agentId, {
    podcast_artwork_url: upload.publicUrl,
  });

  return upload.publicUrl;
}

/**
 * Deletes the artwork for an agent.
 */
export async function deleteArtwork(agentId: string): Promise<void> {
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  if (!agent.podcast_artwork_url) {
    return; // Nothing to delete
  }

  // Delete from storage
  const storagePath = StoragePaths.artwork(agentId);
  await deleteFile(storagePath);

  // Update agent record
  await updateAgentRepo(agentId, {
    podcast_artwork_url: null,
  });
}
