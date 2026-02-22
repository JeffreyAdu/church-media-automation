# Future Features - Episode Management

## Draft Episode Management (Not Implemented Yet)

### Current State
- Episodes can be marked as `published: false` by AI
- Users can SEE draft badges but cannot take action
- No way to manually publish/unpublish episodes

### Needed Features

#### 1. Publish Button
**UI Changes:**
- Add "Publish Now" button on draft episodes
- Confirmation modal: "Publish this episode to RSS feed?"
- Success toast: "Episode published! Will appear in podcast platforms within 24 hours"

**Backend API:**
```
PATCH /agents/:id/episodes/:episodeId
Body: { published: true }
```

**Repository Method:**
```typescript
async function updateEpisodePublishStatus(episodeId: string, published: boolean)
```

#### 2. Show AI Decision Reasoning
**Why was this marked draft?**
- Fetch segmentation data to show:
  - Confidence score
  - Detected category (sermon/announcement/worship/other)
  - AI's reasoning array
  - Sermon likeness score

**UI Component:**
```tsx
<AIAnalysisPanel>
  Confidence: 0.67 (medium)
  Category: Announcement
  Reasons:
  - No clear sermon structure detected
  - Primarily administrative content
  - Duration too short for typical sermon
</AIAnalysisPanel>
```

**Backend API:**
```
GET /agents/:id/episodes/:episodeId/analysis
Returns: segmentation data + AI decision
```

#### 3. Episode Actions Menu
**Dropdown with:**
- 📤 Publish (if draft)
- 🔒 Unpublish (if published)
- ✏️ Edit Metadata
- 🗑️ Delete Episode

**Backend APIs:**
```
PATCH /agents/:id/episodes/:episodeId - Update metadata
DELETE /agents/:id/episodes/:episodeId - Delete episode
```

#### 4. Episode Count Summary Enhancement
**Current:**
```
Episodes (12)
5 Published • 7 Draft
```

**Add Notification After Import:**
```
✓ Processing complete!
  • 5 episodes published to RSS feed
  • 7 drafts need review
```

### Implementation Priority
1. **High:** Publish button (quick manual override)
2. **Medium:** Show AI reasoning (helps user understand)
3. **Low:** Full edit/delete actions (nice-to-have)

### Notes
- RSS feed regenerates automatically when published status changes
- Consider adding "bulk publish" for multiple drafts
- Email notification option for new drafts?

---

## Improved Import Historical Videos Flow (Not Implemented Yet)

### Current State
- User clicks "Import Historical Videos" and picks a single cutoff date
- All videos after that date are immediately queued for processing — no preview, no selection

### Proposed Flow

#### Step 1 — Date Range Selection
Replace the single date picker with a **From → To** date range picker inside the existing `BackfillDialog`.

#### Step 2 — Video Preview Screen
After the user confirms the range, call a new preview endpoint that fetches YouTube video metadata for the channel within that range *without* triggering any processing.

Display results as a **compact list** (thumbnail + title + publish date, one row per video) with:
- "Select All / Deselect All" toggle
- Per-row checkboxes
- Videos already imported shown as grayed out and pre-unchecked (excluded by default)
- Confirm button reads "Import X videos"

#### Step 3 — Targeted Import
POST only the selected video IDs to the backfill endpoint instead of a date range, so only chosen videos are enqueued.

### Backend Changes Needed

**New preview endpoint:**
```
GET /agents/:id/backfill/preview?from=YYYY-MM-DD&to=YYYY-MM-DD
Returns: [{ youtubeVideoId, title, thumbnail, publishedAt, alreadyImported }]
```
- Hits the YouTube Data API (playlist items or search) for the agent's channel
- Cross-references existing episodes in DB to flag `alreadyImported`
- No BullMQ jobs created — read-only

**Updated import endpoint:**
```
POST /agents/:id/backfill
Body: { videoIds: string[] }   // replaces current { date: string }
```
- Accepts an explicit list of video IDs instead of a cutoff date
- Existing date-based logic becomes an internal utility used by the preview → select flow

### Frontend Changes Needed
- `BackfillDialog` becomes a 2-step stepper: Date Range → Review & Select
- New `agentsApi.previewBackfill(id, from, to)` call
- New `agentsApi.startBackfillByIds(id, videoIds)` call (or update existing `startBackfill`)
- Loading/empty states for the preview list

### Notes
- Typical use case is catching up on a handful of missed videos, so lists of 5–30 are most common
- For large ranges (50+ videos) the compact list + Select All handles bulk well
- Pagination on the preview endpoint if result count exceeds ~100
- YouTube API quota usage increases slightly per preview call — cache preview results per (agentId, from, to) for 10 minutes
