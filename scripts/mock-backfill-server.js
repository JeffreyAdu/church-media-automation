/**
 * Mock Backfill Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates the backend's backfill + SSE endpoints so you can exercise the
 * entire backfill UI without touching real YouTube / BullMQ / Redis.
 *
 * SETUP (one-time):
 *   1. Add to churchapp_frontend/.env.local:
 *        VITE_API_BASE_URL=http://localhost:3001
 *      (create the file if it doesn't exist — it is gitignored)
 *
 *   2. Start this server:
 *        pnpm mock           (from church-media-automation/)
 *
 *   3. Open the frontend dev server as usual (pnpm dev in churchapp_frontend/).
 *
 *   4. Log into the app, open any agent's detail page.
 *
 * SCENARIO:
 *   - Click "Import Historical Videos", pick any date, confirm.
 *   - Watch 5 mock videos process over ~15 seconds via SSE.
 *   - Per-video progress SSE opens automatically as each video is "enqueued".
 *   - Cancel button pubs a cancellation update through the backfill stream.
 *
 * RESTORE PRODUCTION:
 *   Remove (or comment out) VITE_API_BASE_URL from .env.local and restart Vite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import http from 'http';

const PORT = 3001;

// ─── In-memory state ──────────────────────────────────────────────────────────
const backfillJobs    = new Map(); // jobId  → job object
const agentJobs       = new Map(); // agentId → jobId[]   (insertion order = newest first)
const backfillStreams = new Map(); // agentId → Set<ServerResponse>
const progressStreams  = new Map(); // compositeJobId → Set<ServerResponse>

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_VIDEOS = [
  { videoId: 'yt_mock_001', title: 'Sunday Service — Jan 5'           },
  { videoId: 'yt_mock_002', title: 'Sunday Service — Jan 12'          },
  { videoId: 'yt_mock_003', title: 'Sunday Service — Jan 19'          },
  { videoId: 'yt_mock_004', title: 'Wednesday Bible Study — Jan 8'    },
  { videoId: 'yt_mock_005', title: 'Sunday Service — Jan 26'          },
  { videoId: 'yt_mock_006', title: 'Sunday Service — Feb 2'           },
  { videoId: 'yt_mock_007', title: 'Wednesday Bible Study — Jan 22'   },
  { videoId: 'yt_mock_008', title: 'Sunday Service — Feb 9'           },
  { videoId: 'yt_mock_009', title: 'Wednesday Bible Study — Feb 5'    },
  { videoId: 'yt_mock_010', title: 'Sunday Service — Feb 16'          },
];

// 3 videos fail at different pipeline stages — 7 succeed
const FAIL_VIDEOS = {
  'yt_mock_004': { reason: 'Transcription failed',  failAtProgress: 52 },
  'yt_mock_007': { reason: 'Download error',         failAtProgress: 18 },
  'yt_mock_009': { reason: 'AI analysis timeout',    failAtProgress: 73 },
};

// Progress stages — each label covers up to its `upTo` threshold
const STAGES = [
  { label: 'Downloading…',         upTo: 20  },
  { label: 'Extracting audio…',    upTo: 35  },
  { label: 'Transcribing…',        upTo: 58  },
  { label: 'AI analysis…',         upTo: 75  },
  { label: 'Generating metadata…', upTo: 88  },
  { label: 'Uploading to storage…',upTo: 99  },
  { label: 'Done',                 upTo: 100 },
];

const ENQUEUE_INTERVAL_MS  = 1000;   // 1s between each video activating — all 10 queued in ~10s
const VIDEO_PROGRESS_TICK  = 9000;   // 9s per tick — ~13 ticks × 9s ≈ 2 min per video
const VIDEO_PROGRESS_STEP  = () => Math.floor(Math.random() * 6) + 7; // 7–12% per tick → ~9–14 ticks to 100%

// ─── SSE helpers ─────────────────────────────────────────────────────────────
function writeSseHeaders(res) {
  res.writeHead(200, {
    'Content-Type':                'text/event-stream',
    'Cache-Control':               'no-cache',
    'Connection':                  'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

function sendSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastBackfill(agentId, payload) {
  const conns = backfillStreams.get(agentId);
  if (!conns) return;
  for (const res of conns) sendSse(res, payload);
}

function broadcastProgress(compositeId, payload) {
  const conns = progressStreams.get(compositeId);
  if (!conns) return;
  for (const res of conns) sendSse(res, payload);
}

// ─── Job simulation ───────────────────────────────────────────────────────────
function simulateBackfill(agentId, jobId) {
  const totalVideos = MOCK_VIDEOS.length;
  let processedCount = 0;
  let activeVideoIds = [];
  let completedVideos = [];
  let queuedVideos = MOCK_VIDEOS.map(v => ({ videoId: v.videoId, title: v.title }));

  // → processing, all videos start as queued
  setTimeout(() => {
    patchJob(agentId, jobId, { status: 'processing', totalVideos, queuedVideos });
  }, 500);

  // Activate videos one by one, staggered
  MOCK_VIDEOS.forEach((vid, idx) => {
    setTimeout(() => {
      // Move from queued → active
      queuedVideos = queuedVideos.filter(v => v.videoId !== vid.videoId);
      activeVideoIds = [...activeVideoIds, vid.videoId];

      patchJob(agentId, jobId, {
        enqueuedVideos: idx + 1,
        activeVideoIds,
        queuedVideos: [...queuedVideos],
      });

      simulateVideoProgress(agentId, vid,
        // onComplete
        () => {
          activeVideoIds = activeVideoIds.filter(id => id !== vid.videoId);
          completedVideos = [...completedVideos, { videoId: vid.videoId, title: vid.title }];
          processedCount++;
          patchJob(agentId, jobId, { processedVideos: processedCount, activeVideoIds, completedVideos });
          checkCompletion();
        },
        // onFail
        (reason) => {
          activeVideoIds = activeVideoIds.filter(id => id !== vid.videoId);
          processedCount++;
          const currentJob = backfillJobs.get(jobId);
          const failedVideos = [...(currentJob?.failedVideos ?? []),
            { videoId: vid.videoId, title: vid.title, reason }];
          patchJob(agentId, jobId, { processedVideos: processedCount, activeVideoIds, failedVideos });
          checkCompletion();
        }
      );
    }, 600 + idx * ENQUEUE_INTERVAL_MS);
  });

  function checkCompletion() {
    if (processedCount >= totalVideos) {
      patchJob(agentId, jobId, { status: 'completed', processedVideos: totalVideos });
    }
  }
}

/** Mutate in-memory job and broadcast a jobUpdate to all open SSE connections. */
function patchJob(agentId, jobId, patch) {
  const job = backfillJobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  broadcastBackfill(agentId, { type: 'jobUpdate', job: { jobId, ...patch } });
}

function simulateVideoProgress(agentId, vid, onComplete, onFail) {
  const compositeId = `${agentId}_${vid.videoId}`;
  const failConfig = FAIL_VIDEOS[vid.videoId] ?? null;
  let progress = 0;

  const timer = setInterval(() => {
    progress = Math.min(progress + VIDEO_PROGRESS_STEP(), 100);

    // Check failure threshold before broadcasting
    if (failConfig && progress >= failConfig.failAtProgress) {
      clearInterval(timer);
      broadcastProgress(compositeId, { type: 'progress', progress, status: failConfig.reason });
      if (onFail) onFail(failConfig.reason);
      return;
    }

    const stage = STAGES.find(s => progress <= s.upTo) ?? STAGES[STAGES.length - 1];
    broadcastProgress(compositeId, { type: 'progress', progress, status: stage.label });

    if (progress >= 100) {
      clearInterval(timer);
      broadcastProgress(compositeId, { type: 'complete', progress: 100, status: 'Done' });
      if (onComplete) onComplete();
    }
  }, VIDEO_PROGRESS_TICK);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

/**
 * Tiny route matcher — returns params object when url matches pattern,
 * null otherwise. Pattern segments starting with : are captured as params.
 */
function match(pattern, url) {
  const pp = pattern.split('/');
  const up = url.split('/');
  if (pp.length !== up.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = up[i];
    else if (pp[i] !== up[i])  return null;
  }
  return params;
}

function mockAgent(id) {
  return {
    id,
    name:                  'Demo Church (mock)',
    youtube_channel_id:    'UCmockChannel123',
    youtube_channel_url:   'https://www.youtube.com/@demochurch',
    rss_slug:              'demo-church',
    status:                'active',
    podcast_title:         'Demo Church Sermons',
    podcast_author:        'Demo Church',
    podcast_description:   'Weekly sermons — mock data only.',
    podcast_artwork_url:   null,
    intro_audio_url:       null,
    outro_audio_url:       null,
    websub_status:         'subscribed',
    websub_expires_at:     new Date(Date.now() + 86_400_000 * 10).toISOString(),
    created_at:            '2025-01-01T00:00:00.000Z',
    updated_at:            new Date().toISOString(),
  };
}

// ─── Request router ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url    = req.url.split('?')[0];
  const method = req.method;

  console.log(`${method} ${url}`);

  let p; // route params

  // ── Backfill SSE ──────────────────────────────────────────────────────────
  if (method === 'GET' && (p = match('/agents/:id/backfill/stream', url))) {
    writeSseHeaders(res);

    const { id } = p;
    if (!backfillStreams.has(id)) backfillStreams.set(id, new Set());
    backfillStreams.get(id).add(res);

    sendSse(res, { type: 'connected' });
    const jobs = (agentJobs.get(id) ?? []).map(jid => backfillJobs.get(jid)).filter(Boolean);
    sendSse(res, { type: 'snapshot', jobs });

    req.on('close', () => backfillStreams.get(id)?.delete(res));
    return;
  }

  // ── Per-video progress SSE ────────────────────────────────────────────────
  if (method === 'GET' && (p = match('/progress/:jobId/stream', url))) {
    writeSseHeaders(res);

    const { jobId } = p;
    sendSse(res, { type: 'connected' });

    if (!progressStreams.has(jobId)) progressStreams.set(jobId, new Set());
    progressStreams.get(jobId).add(res);

    req.on('close', () => progressStreams.get(jobId)?.delete(res));
    return;
  }

  // ── GET /agents ───────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/agents') {
    return json(res, 200, [mockAgent('mock-agent-id')]);
  }

  // ── GET /agents/:id ───────────────────────────────────────────────────────
  if (method === 'GET' && (p = match('/agents/:id', url))) {
    return json(res, 200, mockAgent(p.id));
  }

  // ── GET /agents/:id/episodes ──────────────────────────────────────────────
  if (method === 'GET' && (p = match('/agents/:id/episodes', url))) {
    return json(res, 200, { episodes: [] });
  }

  // ── GET /agents/:id/feed-url ──────────────────────────────────────────────
  if (method === 'GET' && (p = match('/agents/:id/feed-url', url))) {
    return json(res, 200, { feedUrl: `http://localhost:${PORT}/agents/${p.id}/feed.xml` });
  }

  // ── GET /agents/:id/backfill (job list) ───────────────────────────────────
  if (method === 'GET' && (p = match('/agents/:id/backfill', url))) {
    const jobs = (agentJobs.get(p.id) ?? []).map(jid => backfillJobs.get(jid)).filter(Boolean);
    return json(res, 200, jobs);
  }

  // ── GET /agents/:id/backfill/:jobId ───────────────────────────────────────
  if (method === 'GET' && (p = match('/agents/:id/backfill/:jobId', url))) {
    const job = backfillJobs.get(p.jobId);
    return job ? json(res, 200, job) : json(res, 404, { error: 'Job not found' });
  }

  // ── POST /agents/:id/backfill ─────────────────────────────────────────────
  if (method === 'POST' && (p = match('/agents/:id/backfill', url))) {
    const { id } = p;
    const jobId  = `mock-job-${Date.now()}`;
    const now    = new Date().toISOString();
    const job    = {
      jobId,
      status:          'pending',
      totalVideos:      MOCK_VIDEOS.length,
      processedVideos:  0,
      enqueuedVideos:   0,
      activeVideoIds:   [],
      completedVideos: [],
      queuedVideos:     [],
      failedVideos:     [],
      error:            null,
      createdAt:        now,
      updatedAt:        now,
    };
    backfillJobs.set(jobId, job);
    if (!agentJobs.has(id)) agentJobs.set(id, []);
    agentJobs.get(id).unshift(jobId);

    // Immediately notify open SSE connections about the new job
    broadcastBackfill(id, { type: 'jobUpdate', job: { ...job } });

    simulateBackfill(id, jobId);

    return json(res, 200, { jobId, status: 'pending' });
  }

  // ── DELETE /agents/:id/backfill/:jobId (cancel) ───────────────────────────
  if (method === 'DELETE' && (p = match('/agents/:id/backfill/:jobId', url))) {
    const job = backfillJobs.get(p.jobId);
    if (job) {
      patchJob(p.id, p.jobId, { status: 'failed', error: 'Cancelled by user' });
    }
    return json(res, 200, {});
  }

  // ── GET /stats/dashboard ──────────────────────────────────────────────────
  if (method === 'GET' && url === '/stats/dashboard') {
    return json(res, 200, { totalEpisodes: 12 });
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  console.warn(`  ⚠️  No mock route for ${method} ${url}`);
  json(res, 404, { error: `No mock handler for ${method} ${url}` });
});

server.listen(PORT, () => {
  console.log(`\n🎭  Mock backfill server  →  http://localhost:${PORT}`);
  console.log(`\nSetup:`);
  console.log(`  Add to churchapp_frontend/.env.local:`);
  console.log(`    VITE_API_BASE_URL=http://localhost:${PORT}`);
  console.log(`  Then restart the Vite dev server.\n`);
  console.log(`Scenario:`);
  console.log(`  • ${MOCK_VIDEOS.length} mock videos enqueued every ${ENQUEUE_INTERVAL_MS / 1000}s`);
  console.log(`  • Per-video progress streams open as each video is enqueued`);
  console.log(`  • Cancel button publishes a live cancellation update\n`);
});
