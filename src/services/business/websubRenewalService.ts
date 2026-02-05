/**
 * WebSub Renewal Service
 * Renews expiring WebSub subscriptions to ensure continuous notifications.
 */

import { subscribe, buildTopic } from "../external/websub.js";
import { websubConfig } from "../../config/websub.js";
import { findAll, updateAgent } from "../../repositories/agentRepository.js";

/**
 * Renews WebSub subscriptions that are expiring soon.
 * Should be called periodically (e.g., every 12 hours).
 */
export async function renewExpiringSubscriptions(callbackUrl: string): Promise<void> {
  console.log("Checking for expiring WebSub subscriptions...");
  
  const agents = await findAll();
  const now = new Date();
  const renewalWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

  let renewed = 0;
  let failed = 0;

  for (const agent of agents) {
    // Skip inactive agents
    if (agent.status !== "active") {
      continue;
    }

    // Skip if no expiration or not expiring soon
    if (!agent.websub_expires_at) {
      continue;
    }

    const expiresAt = new Date(agent.websub_expires_at);
    if (expiresAt > renewalWindow) {
      continue; // Not expiring soon
    }

    console.log(`Renewing subscription for agent ${agent.name} (channel: ${agent.youtube_channel_id})`);

    try {
      // Re-subscribe (renewal is just subscribing again)
      await subscribe(agent.youtube_channel_id, callbackUrl);

      // Update expiration time
      const newExpiresAt = new Date(Date.now() + (websubConfig.leaseSeconds - 3600) * 1000);
      const topic = buildTopic(agent.youtube_channel_id);

      await updateAgent(agent.id, {
        websub_topic_url: topic,
        websub_callback_url: callbackUrl,
        websub_lease_seconds: websubConfig.leaseSeconds,
        websub_expires_at: newExpiresAt.toISOString(),
        websub_status: "subscribed",
      } as any);

      console.log(`✓ Renewed subscription for ${agent.name} (expires ${newExpiresAt.toISOString()})`);
      renewed++;
    } catch (error) {
      console.error(`Failed to renew subscription for ${agent.name}:`, error);
      
      // Mark as error
      await updateAgent(agent.id, {
        websub_status: "error",
      } as any);
      
      failed++;
    }
  }

  console.log(`WebSub renewal complete: ${renewed} renewed, ${failed} failed`);
}
