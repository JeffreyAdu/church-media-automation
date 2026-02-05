/**
 * BullMQ queues
 */

import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const queues = {
  processVideo: new Queue("processVideo", { connection: redis }),
};
