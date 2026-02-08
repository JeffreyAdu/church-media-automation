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
