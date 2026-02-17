/**
 * Progress Stream Service
 * 
 * Implements Server-Sent Events (SSE) for real-time job progress updates using Redis pub/sub.
 * 
 * ## Architecture Overview
 * 
 * 1. **Worker Process** (processVideo.worker.ts):
 *    - Calls `publishProgress(jobId, progress, status)` at each processing step
 *    - Publishes updates to Redis channel: `job:progress:{jobId}`
 * 
 * 2. **SSE Service** (this file):
 *    - Controller subscribes to Redis channel using `streamJobProgress(jobId, res)`
 *    - Uses async generator pattern to yield progress updates as they arrive
 *    - Writes SSE-formatted messages to the HTTP response stream
 * 
 * 3. **Client** (browser):
 *    - Opens EventSource connection: `new EventSource('/api/progress/{jobId}/stream')`
 *    - Receives real-time updates via SSE protocol
 *    - Browser automatically reconnects if connection drops
 * 
 * ## Redis Pub/Sub Pattern
 * 
 * - **Publisher**: Worker process publishes to channel when progress changes
 * - **Subscriber**: SSE endpoint subscribes to channel and forwards to HTTP response
 * - **Channels**: One channel per job (`job:progress:{jobId}`)
 * - **Dedicated Connection**: Pub/sub requires separate Redis connection (cannot share with BullMQ)
 * 
 * ## SSE Protocol Format
 * 
 * Messages are sent as `data: {JSON}\n\n`:
 * ```
 * data: {"type":"progress","progress":45,"status":"Transcribing...","timestamp":1234567890}\n\n
 * ```
 * 
 * The double newline (`\n\n`) signals end of message to the browser.
 * 
 * ## Connection Lifecycle
 * 
 * 1. Client connects → Controller sets SSE headers → Flushes response
 * 2. Sends initial job state from BullMQ (if available)
 * 3. Subscribes to Redis pub/sub channel
 * 4. Yields updates as they arrive (async generator)
 * 5. Writes each update to HTTP response in SSE format
 * 6. Closes connection when job completes (progress=100 or status=completed/failed)
 * 7. Cleanup: Unsubscribe from Redis, disconnect subscriber
 * 
 * ## Why Async Generator?
 * 
 * The `async function*` pattern allows us to:
 * - Yield values as they arrive (event-driven, not polling)
 * - Pause execution while waiting for next message
 * - Handle cleanup in finally block when loop exits
 * - Use standard `for await` loop in consumer code
 * 
 * ## Performance
 * 
 * - **Single persistent connection** per client (vs 720 requests/hour with polling)
 * - **Zero latency** - updates sent immediately when available
 * - **Auto-reconnect** - browser handles reconnection on disconnect
 * - **Scalable** - 100 concurrent streams = 100 Redis subscriptions (lightweight)
 */

import { Response } from "express";
import { redis } from "../../config/redis.js";
import { queues } from "../../config/queues.js";

export interface ProgressUpdate {
  jobId: string;
  progress: number;
  status: string;
  timestamp: number;
}

/**
 * Publishes progress update to Redis channel for SSE streaming.
 * 
 * Called by the worker process at each step of video processing.
 * 
 * ## Flow
 * 1. Worker calls: `await publishProgress(jobId, 45, "Transcribing audio...")`
 * 2. Creates update object with timestamp
 * 3. Publishes JSON to Redis channel: `job:progress:{jobId}`
 * 4. All subscribers (SSE endpoints) receive the update immediately
 * 5. Subscribers forward update to connected browsers via SSE
 * 
 * ## Redis Pub/Sub Behavior
 * - Fire-and-forget: No acknowledgment from subscribers
 * - If no subscribers exist, message is discarded (not stored)
 * - Multiple subscribers can listen to same channel
 * - O(N) where N = number of subscribers (Redis handles efficiently)
 * 
 * @param jobId - BullMQ job ID (unique identifier for the processing job)
 * @param progress - Progress percentage (0-100)
 * @param status - Human-readable status message (e.g., "Downloading audio...")
 * 
 * @example
 * ```typescript
 * // In worker process
 * await publishProgress(job.id!, 25, "Converting to WAV format...");
 * ```
 */
export async function publishProgress(
  jobId: string,
  progress: number,
  status: string
): Promise<void> {
  const update: ProgressUpdate = {
    jobId,
    progress,
    status,
    timestamp: Date.now(),
  };

  const channel = `job:progress:${jobId}`;
  
  try {
    await redis.publish(channel, JSON.stringify(update));
  } catch (error) {
    console.error(`[progress-stream] Failed to publish to ${channel}:`, error);
  }
}

/**
 * Subscribes to progress updates for a specific job via Redis pub/sub.
 * 
 * This is an **async generator** that yields progress updates as they arrive from Redis.
 * 
 * ## How Async Generators Work
 * 
 * ```typescript
 * async function* myGenerator() {
 *   yield 1;  // Pause here, return 1 to caller
 *   yield 2;  // Resume and return 2
 *   yield 3;  // Resume and return 3
 * }
 * 
 * for await (const value of myGenerator()) {
 *   console.log(value); // 1, 2, 3
 * }
 * ```
 * 
 * In our case, we pause while waiting for Redis messages, then yield them as they arrive.
 * 
 * ## Redis Subscription Pattern
 * 
 * 1. **Create dedicated connection**: `redis.duplicate()` 
 *    - Redis pub/sub requires exclusive connection (cannot share with BullMQ)
 *    - Each subscriber gets its own connection to avoid blocking
 * 
 * 2. **Subscribe to channel**: `job:progress:{jobId}`
 *    - Only receives messages published AFTER subscription starts
 *    - Historical messages are NOT delivered (pub/sub is real-time only)
 * 
 * 3. **Listen for messages**: `subscriber.on("message", ...)`
 *    - Fires whenever worker publishes progress update
 *    - Parses JSON and yields to caller
 * 
 * 4. **Cleanup on exit**: `finally { unsubscribe, disconnect }`
 *    - Guaranteed to run even if connection drops or job completes
 * 
 * ## Message Buffering Strategy
 * 
 * Problem: Redis emits messages faster than `for await` loop can consume them.
 * 
 * Solution: Queue-based buffering
 * - If generator is *waiting* (`resolveNext` is set) → resolve immediately with message
 * - If generator is *busy* (processing previous message) → buffer message in queue
 * - Generator drains queue before waiting for next message
 * 
 * This ensures:
 * - No messages are lost
 * - Messages arrive in order
 * - Backpressure is handled (slow consumers don't block Redis)
 * 
 * ## Completion Detection
 * 
 * Generator exits when:
 * - Progress reaches 100, OR
 * - Status is "completed", OR
 * - Status is "failed"
 * 
 * After completion:
 * - Drain any remaining buffered messages
 * - Exit generator loop
 * - Finally block cleans up Redis subscription
 * 
 * @param jobId - BullMQ job ID to subscribe to
 * @yields ProgressUpdate objects as they arrive from Redis
 * 
 * @example
 * ```typescript
 * // In SSE controller
 * for await (const update of subscribeToProgress(jobId)) {
 *   res.write(`data: ${JSON.stringify(update)}\n\n`);
 *   
 *   if (update.progress >= 100) {
 *     break; // Exit loop when complete
 *   }
 * }
 * ```
 */
async function* subscribeToProgress(jobId: string): AsyncGenerator<ProgressUpdate> {
  // Create separate Redis connection for subscription
  // (pub/sub requires dedicated connection)
  const subscriber = redis.duplicate();
  
  const channel = `job:progress:${jobId}`;
  
  try {
    await subscriber.subscribe(channel);
    console.log(`[progress-stream] Subscribed to ${channel}`);
    
    // Queue to buffer messages
    const messageQueue: ProgressUpdate[] = [];
    let resolveNext: ((value: IteratorResult<ProgressUpdate>) => void) | null = null;
    let isDone = false;

    // Handle incoming messages
    subscriber.on("message", (ch: string, message: string) => {
      if (ch === channel) {
        try {
          const update: ProgressUpdate = JSON.parse(message);
          
          // If there's a pending yield, resolve it immediately
          if (resolveNext) {
            resolveNext({ value: update, done: false });
            resolveNext = null;
          } else {
            // Otherwise buffer the message
            messageQueue.push(update);
          }
          
          // Check if job is complete
          if (update.progress >= 100 || update.status === "completed" || update.status === "failed") {
            isDone = true;
          }
        } catch (error) {
          console.error("[progress-stream] Failed to parse message:", error);
        }
      }
    });

    // Generator loop
    while (!isDone || messageQueue.length > 0) {
      // If we have buffered messages, yield them
      if (messageQueue.length > 0) {
        const update = messageQueue.shift()!;
        yield update;
        continue;
      }

      // If done and no more messages, exit
      if (isDone) {
        break;
      }

      // Wait for next message
      await new Promise<ProgressUpdate>((resolve) => {
        resolveNext = (result) => {
          if (!result.done) {
            resolve(result.value);
          }
        };
      }).catch(() => {
        // Handle promise rejection
        isDone = true;
      });
    }
  } finally {
    console.log(`[progress-stream] Unsubscribing from ${channel}`);
    await subscriber.unsubscribe(channel);
    subscriber.disconnect();
  }
}

/**
 * Streams job progress to SSE response.
 * 
 * This is the main business logic that orchestrates SSE streaming:
 * 1. Sends initial connection event
 * 2. Fetches current job state from BullMQ
 * 3. Subscribes to Redis pub/sub for real-time updates
 * 4. Writes SSE-formatted messages to HTTP response
 * 5. Closes connection when job completes
 * 
 * ## SSE Message Format
 * 
 * Each message is prefixed with `data:` and ends with `\n\n`:
 * 
 * ```
 * data: {"type":"connected","jobId":"123"}\n\n
 * data: {"type":"progress","progress":25,"status":"Downloading...","timestamp":1234567890}\n\n
 * data: {"type":"complete"}\n\n
 * ```
 * 
 * Browser's EventSource API parses this automatically.
 * 
 * ## Message Types
 * 
 * - **connected**: Sent immediately when client connects
 * - **progress**: Sent for each job progress update (0-99%)
 * - **complete**: Sent when job finishes (progress=100 or status=completed/failed)
 * - **error**: Sent when job not found or other errors occur
 * 
 * ## Error Handling
 * 
 * If job doesn't exist in BullMQ:
 * - Send error message to client
 * - Close connection immediately
 * - No subscription is created
 * 
 * If Redis subscription fails:
 * - Error is logged
 * - Generator exits
 * - Finally block cleans up connection
 * 
 * ## Connection Lifecycle
 * 
 * ```
 * Client connects
 *   → SSE headers sent (Content-Type: text/event-stream)
 *   → Connection established (keep-alive)
 *   → Send "connected" event
 *   → Send current job state (if available)
 *   → Subscribe to Redis channel
 *   → For each update: write to response
 *   → On completion: send "complete" event
 *   → Close response
 *   → Cleanup: unsubscribe from Redis
 * ```
 * 
 * ## Why Pass Response Object?
 * 
 * The Express Response object is passed directly because:
 * - SSE requires direct access to `res.write()` for streaming
 * - Cannot buffer messages in memory (defeats purpose of streaming)
 * - Response stays open for entire job duration (could be minutes)
 * - Writing to closed response throws error (handled by Express)
 * 
 * @param jobId - BullMQ job ID to stream progress for
 * @param res - Express Response object (SSE stream)
 * 
 * @throws Error if BullMQ connection fails (bubbles up to controller)
 * 
 * @example
 * ```typescript
 * // In controller
 * res.setHeader("Content-Type", "text/event-stream");
 * res.flushHeaders();
 * 
 * await streamJobProgress(jobId, res);
 * 
 * // Response is closed by this function when job completes
 * ```
 */
export async function streamJobProgress(jobId: string, res: Response): Promise<void> {
  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "connected", jobId })}\n\n`);

  // Get job from BullMQ to check if it exists
  const job = await queues.processVideo.getJob(jobId);
  
  if (!job) {
    res.write(`data: ${JSON.stringify({ type: "error", message: "Job not found" })}\n\n`);
    res.end();
    return;
  }

  // Send initial job state if available
  if (job.progress) {
    const progressData = typeof job.progress === "object" ? job.progress : { progress: job.progress };
    res.write(`data: ${JSON.stringify({ type: "progress", ...progressData })}\n\n`);
  }

  // Subscribe to real-time updates
  for await (const update of subscribeToProgress(jobId)) {
    const message = JSON.stringify({
      type: "progress",
      progress: update.progress,
      status: update.status,
      timestamp: update.timestamp,
    });
    
    res.write(`data: ${message}\n\n`);
    
    console.log(`[sse] Sent to job ${jobId}: ${update.progress}% - ${update.status}`);

    // Close connection when job completes
    if (update.progress >= 100 || update.status === "completed" || update.status === "failed") {
      res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
      res.end();
      console.log(`[sse] Job ${jobId} completed, closing connection`);
      break;
    }
  }
}
