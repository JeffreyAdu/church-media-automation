/**
 * WebSub External Service
 * Handles subscription management with YouTube's WebSub hub.
 */

import { websubConfig } from "../../config/websub.js";

/**
 * Builds YouTube channel topic URL for WebSub subscription.
 */
export function buildTopic(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
}

/**
 * Subscribes to YouTube channel updates via WebSub.
 * Returns subscription details on success.
 */
export async function subscribe(channelId: string, callbackUrl: string): Promise<void> {
  const topic = buildTopic(channelId);
  
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.topic": topic,
    "hub.callback": callbackUrl,
    "hub.lease_seconds": websubConfig.leaseSeconds.toString(),
    "hub.secret": websubConfig.secret,
  });

  const response = await fetch(websubConfig.hubUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WebSub subscription failed: ${response.status} ${text}`);
  }

  console.log(`✓ WebSub subscription requested for channel ${channelId}`);
}

/**
 * Unsubscribes from YouTube channel updates.
 */
export async function unsubscribe(channelId: string, callbackUrl: string): Promise<void> {
  const topic = buildTopic(channelId);
  
  const params = new URLSearchParams({
    "hub.mode": "unsubscribe",
    "hub.topic": topic,
    "hub.callback": callbackUrl,
  });

  const response = await fetch(websubConfig.hubUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WebSub unsubscribe failed: ${response.status} ${text}`);
  }

  console.log(`✓ WebSub unsubscribe requested for channel ${channelId}`);
}

/**
 * Verifies WebSub notification signature using HMAC-SHA1.
 * Returns true if signature is valid.
 */
export async function verifySignature(
  body: string,
  signature: string | undefined
): Promise<boolean> {
  if (!signature) {
    // No signature provided - accept in dev, reject in production
    return process.env.NODE_ENV !== "production";
  }

  // Signature format: "sha1=<hex>"
  const [algorithm, expectedHash] = signature.split("=");
  
  if (algorithm !== "sha1") {
    return false;
  }

  // Use Web Crypto API to compute HMAC
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(websubConfig.secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computedHash = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === expectedHash;
}
