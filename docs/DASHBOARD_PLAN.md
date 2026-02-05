# Real-Time Dashboard Implementation Plan

## Overview
Frontend dashboard for monitoring video processing in real-time, whether from backfill operations or live YouTube channel updates via WebSub.

## Phase 1: MVP Dashboard (Basic Job Status)

### Backend Changes

#### 1. WebSocket Server Setup
```typescript
// src/config/socket.ts
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Client subscribes to specific agent's updates
    socket.on("subscribe:agent", (agentId: string) => {
      socket.join(`agent:${agentId}`);
      console.log(`Socket ${socket.id} subscribed to agent:${agentId}`);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}
```

```typescript
// src/server.ts - Update to attach Socket.IO
import { createServer } from "http";
import { setupWebSocket } from "./config/socket.js";

const httpServer = createServer(app);
const io = setupWebSocket(httpServer);

// Make io available to routes/services
app.set("io", io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

#### 2. New API Endpoints
```typescript
// src/routes/jobs.ts
GET /agents/:id/jobs           // All jobs (paginated, newest first)
GET /agents/:id/jobs/active    // Currently processing jobs
GET /agents/:id/jobs/:jobId    // Specific job details
GET /agents/:id/stats          // Agent statistics

// Response examples:
// GET /agents/:id/jobs?page=1&limit=20
{
  "jobs": [
    {
      "id": "uuid",
      "videoId": "uuid",
      "videoTitle": "Sunday Service 01/26/2026",
      "status": "processing",
      "stage": "speech_detection",
      "progress": 30,
      "createdAt": "2026-01-31T10:00:00Z",
      "updatedAt": "2026-01-31T10:05:00Z"
    }
  ],
  "total": 45,
  "page": 1,
  "totalPages": 3
}

// GET /agents/:id/stats
{
  "totalVideos": 120,
  "totalEpisodes": 98,
  "publishedEpisodes": 85,
  "unpublishedEpisodes": 13,
  "activeJobs": 3,
  "failedJobs": 22,
  "successRate": 81.67
}
```

#### 3. Database Schema Updates
```sql
-- Migration: Add progress tracking to jobs table
ALTER TABLE jobs 
  ADD COLUMN current_stage TEXT DEFAULT 'queued',
  ADD COLUMN progress_percentage INTEGER DEFAULT 0;

-- Possible stages: queued, downloading, speech_detection, ai_analysis, 
--                  audio_processing, uploading, completed, failed
```

#### 4. Basic Job Service
```typescript
// src/services/business/jobService.ts
export async function getJobsByAgentId(agentId: string, page = 1, limit = 20) {
  // Query jobs with pagination
}

export async function getActiveJobs(agentId: string) {
  // Query jobs with status IN ('pending', 'processing')
}

export async function getJobDetails(jobId: string) {
  // Get job with video and episode details
}

export async function getAgentStats(agentId: string) {
  // Aggregate stats from jobs, videos, episodes tables
}
```

### Frontend (React/Next.js)

#### Components Needed
```
src/
├── components/
│   ├── AgentDashboard.tsx       // Main dashboard container
│   ├── JobsList.tsx              // List of all jobs
│   ├── ActiveJobsPanel.tsx       // Currently processing jobs
│   ├── JobCard.tsx               // Individual job display
│   ├── StatsCards.tsx            // Total videos, episodes, success rate
│   └── EpisodesList.tsx          // Published/unpublished episodes
├── hooks/
│   └── useAgentData.ts           // React Query hooks
└── lib/
    └── socket.ts                 // Socket.IO client setup
```

#### Basic Job Display
```tsx
// JobCard.tsx
interface Job {
  id: string;
  videoTitle: string;
  status: "pending" | "processing" | "completed" | "failed";
  stage: string;
  progress: number;
  createdAt: string;
}

function JobCard({ job }: { job: Job }) {
  return (
    <div className="border rounded p-4">
      <h3>{job.videoTitle}</h3>
      <div className="mt-2">
        <div className="text-sm text-gray-600">{job.stage}</div>
        <div className="w-full bg-gray-200 rounded h-2 mt-1">
          <div 
            className="bg-blue-500 h-2 rounded"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-2">
        Started {new Date(job.createdAt).toLocaleString()}
      </div>
    </div>
  );
}
```

---

## Phase 2: Real-Time Updates (WebSocket Integration)

### Backend Changes

#### 1. Progress Events in Orchestrator
```typescript
// src/jobs/orchestrators/processVideoOrchestrator.ts
import type { Server } from "socket.io";

export async function processVideo(job: Job) {
  const { agentId, youtubeVideoId, youtubeUrl } = job.data;
  const io: Server = job.queue.client.get("io"); // Access Socket.IO instance

  // Helper to emit progress
  const emitProgress = (stage: string, progress: number, message: string) => {
    io.to(`agent:${agentId}`).emit("job:progress", {
      jobId: job.id,
      videoId: youtubeVideoId,
      stage,
      progress,
      message,
      timestamp: new Date().toISOString()
    });
  };

  try {
    // 1. Downloading
    emitProgress("downloading", 10, "Downloading audio from YouTube...");
    const download = await downloadAudio(youtubeUrl);

    // 2. Speech Detection
    emitProgress("speech_detection", 30, "Detecting speech segments...");
    const speechSegments = await detectSpeech(wavPath);

    // 3. AI Analysis
    emitProgress("ai_analysis", 50, "AI analyzing content for sermon detection...");
    const aiResult = await analyzeContent(transcript, metadata);

    // 4. Audio Processing
    emitProgress("audio_processing", 70, "Processing audio with intro/outro...");
    const finalEpisode = await mergeAudio([introPath, sermonPath, outroPath]);

    // 5. Uploading
    emitProgress("uploading", 90, "Uploading to storage...");
    const upload = await uploadAudioFile(finalPath, storagePath);

    // 6. Completed
    emitProgress("completed", 100, "Episode created successfully!");
    io.to(`agent:${agentId}`).emit("job:completed", {
      jobId: job.id,
      episodeId: episode.id,
      published: aiResult.decision.should_autopublish
    });

  } catch (error) {
    emitProgress("failed", 0, error.message);
    io.to(`agent:${agentId}`).emit("job:failed", {
      jobId: job.id,
      error: error.message,
      stage: currentStage
    });
    throw error;
  }
}
```

#### 2. Backfill Progress Events
```typescript
// src/services/business/backfillService.ts
export async function backfillVideos(agentId: string, since: Date, io: Server) {
  const youtubeVideos = await fetchChannelVideosSince(channelId, since);

  io.to(`agent:${agentId}`).emit("backfill:started", {
    totalVideos: youtubeVideos.length,
    since: since.toISOString()
  });

  for (const video of youtubeVideos) {
    const upserted = await upsertVideo({ ... });
    
    if (upserted.status === "discovered") {
      await enqueueProcessVideo({ ... });
      
      io.to(`agent:${agentId}`).emit("video:discovered", {
        videoId: video.videoId,
        title: video.title,
        publishedAt: video.publishedAt
      });
    }
  }

  io.to(`agent:${agentId}`).emit("backfill:completed", {
    totalFound: youtubeVideos.length,
    totalEnqueued: enqueuedCount
  });
}
```

### Frontend Changes

#### 1. Socket.IO Client Setup
```typescript
// src/lib/socket.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectSocket(agentId: string) {
  if (socket?.connected) return socket;

  socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000", {
    transports: ["websocket"],
    auth: { agentId }
  });

  socket.on("connect", () => {
    console.log("Connected to server");
    socket?.emit("subscribe:agent", agentId);
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
```

#### 2. Real-Time Job Updates Hook
```tsx
// src/hooks/useRealtimeJobs.ts
import { useEffect, useState } from "react";
import { connectSocket } from "@/lib/socket";

interface JobProgress {
  jobId: string;
  stage: string;
  progress: number;
  message: string;
  timestamp: string;
}

export function useRealtimeJobs(agentId: string) {
  const [activeJobs, setActiveJobs] = useState<Map<string, JobProgress>>(new Map());

  useEffect(() => {
    const socket = connectSocket(agentId);

    socket.on("job:progress", (data: JobProgress) => {
      setActiveJobs(prev => new Map(prev).set(data.jobId, data));
    });

    socket.on("job:completed", ({ jobId }) => {
      setActiveJobs(prev => {
        const next = new Map(prev);
        next.delete(jobId);
        return next;
      });
      // Trigger refetch of episodes list
    });

    socket.on("job:failed", ({ jobId, error }) => {
      // Show error notification
      setActiveJobs(prev => {
        const next = new Map(prev);
        next.delete(jobId);
        return next;
      });
    });

    return () => {
      socket.off("job:progress");
      socket.off("job:completed");
      socket.off("job:failed");
    };
  }, [agentId]);

  return { activeJobs: Array.from(activeJobs.values()) };
}
```

#### 3. Live Job Monitor Component
```tsx
// src/components/ActiveJobsPanel.tsx
import { useRealtimeJobs } from "@/hooks/useRealtimeJobs";

export function ActiveJobsPanel({ agentId }: { agentId: string }) {
  const { activeJobs } = useRealtimeJobs(agentId);

  if (activeJobs.length === 0) {
    return <div>No active jobs</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Processing Now</h2>
      {activeJobs.map(job => (
        <div key={job.jobId} className="border rounded p-4 animate-pulse">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">{job.message}</span>
            <span className="text-sm text-gray-500">{job.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Stage: {job.stage}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## WebSocket Event Types Reference

```typescript
// Events emitted by server:

"job:progress" {
  jobId: string;
  videoId: string;
  stage: "downloading" | "speech_detection" | "ai_analysis" | 
         "audio_processing" | "uploading" | "completed" | "failed";
  progress: number; // 0-100
  message: string;
  timestamp: string;
}

"job:completed" {
  jobId: string;
  episodeId: string;
  published: boolean;
}

"job:failed" {
  jobId: string;
  error: string;
  stage: string;
}

"video:discovered" {
  videoId: string;
  title: string;
  publishedAt: string;
}

"backfill:started" {
  totalVideos: number;
  since: string;
}

"backfill:completed" {
  totalFound: number;
  totalEnqueued: number;
}
```

---

## Dependencies to Add

### Backend
```bash
pnpm add socket.io
pnpm add -D @types/socket.io
```

### Frontend
```bash
npm install socket.io-client
npm install @tanstack/react-query
npm install zustand  # Optional state management
```

---

## Environment Variables

### Backend (.env)
```bash
FRONTEND_URL=http://localhost:5173  # CORS for Socket.IO
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Testing Plan

1. **Manual Testing:**
   - Create agent
   - Run backfill with 2-3 videos
   - Watch dashboard update in real-time
   - Verify progress bars, stage transitions
   - Test job failure scenarios

2. **Monitoring:**
   - Check WebSocket connection in browser DevTools
   - Watch server logs for emitted events
   - Verify database updates match UI state

3. **Edge Cases:**
   - Multiple clients connected to same agent
   - Network disconnection/reconnection
   - Very fast jobs (completed before UI loads)
   - Very slow jobs (multi-hour processing)
