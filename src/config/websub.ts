/**
 * WebSub (PubSubHubbub) Configuration
 * Settings for YouTube subscription management via WebSub protocol.
 */

import {
  WEBSUB_HUB_URL,
  WEBSUB_CALLBACK_PATH,
  WEBSUB_LEASE_SECONDS,
  WEBSUB_SECRET,
  NODE_ENV,
  PORT,
  PUBLIC_BASE_URL,
} from "./env.js";

/**
 * WebSub configuration constants.
 * Used for subscribing to YouTube channel updates.
 */
export const websubConfig = {
  hubUrl: WEBSUB_HUB_URL,
  callbackPath: WEBSUB_CALLBACK_PATH,
  leaseSeconds: Number(WEBSUB_LEASE_SECONDS ?? 864000), // Default 10 days
  secret: WEBSUB_SECRET,
} as const;

/**
 * Builds the full callback URL for WebSub subscriptions.
 * Constructs URL from environment variables.
 */
export function buildCallbackUrl(): string {
  // If PUBLIC_BASE_URL is provided (e.g., https://<subdomain>.ngrok-free.app), use it
  if (PUBLIC_BASE_URL) {
    const base = PUBLIC_BASE_URL.endsWith("/") ? PUBLIC_BASE_URL : `${PUBLIC_BASE_URL}/`;
    const url = new URL(WEBSUB_CALLBACK_PATH.startsWith("/") ? WEBSUB_CALLBACK_PATH.slice(1) : WEBSUB_CALLBACK_PATH, base);
    return url.toString();
  }

  // Fallback to local host + port
  const protocol = NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.HOST || 'localhost';
  const port = PORT;
  return `${protocol}://${host}:${port}${WEBSUB_CALLBACK_PATH}`;
}
