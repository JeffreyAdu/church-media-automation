/**
 * Redis client for BullMQ
 */

import IORedis from "ioredis";
import { REDIS_URL } from "./env.js";

// Parse the Redis URL to extract connection details
const redisUrl = new URL(REDIS_URL);

export const redis = new IORedis({
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || "6379"),
  password: redisUrl.password,
  username: redisUrl.username || undefined,
  
  // BullMQ requirements
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  
  // Upstash-specific settings for cloud connectivity
  connectTimeout: 60000, // 60s for slow networks
  commandTimeout: 10000,
  keepAlive: 30000,
  family: 4, // Force IPv4
  
  // TLS configuration for Upstash (always use TLS)
  tls: {
    rejectUnauthorized: true, // Trust valid certs
  },
  
  // Retry strategy for connection issues
  retryStrategy: (times: number) => {
    if (times > 20) {
      console.error(`[Redis] Failed to connect after ${times} attempts`);
      return null; // Stop retrying
    }
    const delay = Math.min(times * 500, 5000);
    console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  
  // Reconnect on error
  reconnectOnError: (err) => {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      return true; // Reconnect if Redis is in readonly mode
    }
    return false;
  },
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[Redis] Connected successfully");
});

redis.on("ready", () => {
  console.log("[Redis] Ready to accept commands");
});
