# Pre-Deployment Checklist

## ✅ Dockerfile Dependencies (COMPLETE)

### System Packages Installed:
- ✅ **ffmpeg** - Audio/video processing
- ✅ **python3** & **python3-pip** - For yt-dlp
- ✅ **yt-dlp** - YouTube download (installed via pip3)
- ✅ **make** & **g++** - Native Node module compilation
- ✅ **curl** - Health checks & file downloads
- ✅ **ca-certificates** - HTTPS connections (OpenAI, YouTube, Supabase)

### Node.js Dependencies (Installed via pnpm):
- ✅ **youtube-dl-exec** - Wrapper for yt-dlp binary
- ✅ **fluent-ffmpeg** - FFmpeg wrapper
- ✅ **avr-vad** - Voice Activity Detection (ONNX runtime bundled)
- ✅ **sharp** - Image processing (uses prebuilt binaries)
- ✅ **openai** - AI transcription & sermon detection
- ✅ **@supabase/supabase-js** - Storage & database
- ✅ **bullmq** - Job queue
- ✅ **ioredis** - Redis client

## ✅ Progress Tracking (COMPLETE)

### Backend:
- ✅ Orchestrator has 10 progress update calls (5% → 100%)
- ✅ Worker passes updateProgress callback to orchestrator
- ✅ Service fetches active videos from BullMQ with progress
- ✅ Controller returns activeVideos in API response

### Frontend:
- ✅ ProcessingStatus component polls every 3s
- ✅ Displays individual video progress cards
- ✅ Shows progress bar + status message per video
- ✅ Updates in real-time as stages complete

### Progress Stages:
1. 5% - "Downloading audio from YouTube..."
2. 15% - "Converting to WAV format..."
3. 25% - "Detecting speech segments..."
4. 35% - "Extracting speech segments..."
5. 45% - "Transcribing audio with AI..."
6. 65% - "Extracting sermon segment..."
7. 75% - "Assembling final episode..."
8. 85% - "Uploading to cloud storage..."
9. 95% - "Creating episode record..."
10. 100% - "Processing complete!"

## ✅ Episode Publishing Status (COMPLETE)

### UI Indicators:
- ✅ Published badge (green): "✓ Published"
- ✅ Draft badge (yellow): "📋 Draft"
- ✅ Episode count summary: "5 Published • 7 Draft"
- ✅ Field mapping fixed: `published` (not `is_published`)

### Behavior:
- ✅ Published episodes → Appear in RSS feed
- ✅ Draft episodes → Visible in UI but excluded from RSS
- ✅ AI autopublish decision stored in `episodes.published` field

## ⚠️ Known Limitations (Documented for Future)

### Episode Management (Not Implemented):
- ❌ No "Publish" button for drafts
- ❌ Can't see WHY AI marked as draft
- ❌ No edit/delete actions
- ❌ No notification when drafts need review

**See:** `/docs/FUTURE_FEATURES.md` for implementation plan

## 🚀 Ready to Deploy

### Deployment Command:
```bash
cd church-media-automation
flyctl deploy
```

### Post-Deploy Verification:
1. Check logs: `flyctl logs`
2. Verify worker connects to Redis
3. Import historical videos from agent page
4. Watch progress tracking in UI
5. Verify episodes appear after completion
6. Check published vs draft badges
7. Test audio playback
8. Verify RSS feed includes only published episodes

### Expected Behavior:
- User imports videos → Jobs enqueued
- Worker processes with real-time progress updates
- Frontend shows: "Downloading..." → "Transcribing..." → "Publishing..."
- Episodes appear in UI with audio player
- Published episodes go to RSS feed
- Draft episodes stay internal (need manual review per future feature)

## 📋 Environment Variables Required

Make sure these are set in Fly.io:
- `DATABASE_URL` - Supabase PostgreSQL
- `SUPABASE_URL` - Supabase API
- `SUPABASE_ANON_KEY` - Supabase public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key
- `REDIS_URL` - Upstash Redis connection
- `OPENAI_API_KEY` - OpenAI API key
- `YOUTUBE_API_KEY` - YouTube Data API v3
- `NODE_ENV=production`
- `PORT=3000`

## 🎯 Success Criteria

After deployment, verify:
1. ✅ Worker starts and connects to Redis
2. ✅ Video downloads succeed (yt-dlp works)
3. ✅ Progress updates appear in UI
4. ✅ Episodes created and playable
5. ✅ Published/draft badges correct
6. ✅ RSS feed only shows published episodes
