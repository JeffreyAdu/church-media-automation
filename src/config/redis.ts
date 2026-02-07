/**
 * Redis client for BullMQ - Fly.io Redis (Upstash)
 */

import IORedis from "ioredis";
import { REDIS_URL } from "./env.js";

export const redis = new IORedis(REDIS_URL, {
  // BullMQ requirements
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  
  // Connection timeouts
  connectTimeout: 10000, // 10s
  commandTimeout: 5000,  // 5s
  
  // Retry strategy
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error(`[Redis] Failed to connect after ${times} attempts`);
      return null;
    }
    return Math.min(times * 500, 2000);
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
