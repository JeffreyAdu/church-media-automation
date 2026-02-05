/**
 * Redis client for BullMQ
 */

import IORedis from "ioredis";
import { REDIS_URL } from "./env.js";

export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});
