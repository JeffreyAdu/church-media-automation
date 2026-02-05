# Artwork Upload Implementation

## Overview
Implemented artwork upload system for podcast cover art. Spotify requires:
- Image dimensions: 1400x1400 to 3000x3000 pixels
- Format: JPG or PNG
- Max file size: 10MB

## Endpoints

### Upload Artwork
```http
POST /agents/:id/artwork
Content-Type: multipart/form-data

Field: image (jpg/jpeg/png file)
```

**Response:**
```json
{
  "podcast_artwork_url": "https://...supabase.co/storage/v1/object/public/..."
}
```

### Delete Artwork
```http
DELETE /agents/:id/artwork
```

**Response:** 204 No Content

## Database Schema
The `agents` table already has the `podcast_artwork_url` column:
```sql
podcast_artwork_url TEXT
```

## Implementation Details

### Storage Path
```
artwork/agents/{agentId}/cover.jpg
```

### TypeScript Interface Updates
- Added `podcast_artwork_url` to `Agent`, `CreateAgentInput`, `UpdateAgentInput`

### RSS Feed Integration
The RSS feed now includes the artwork in the `<itunes:image>` and `<image>` tags:
```xml
<itunes:image href="..."/>
<image>
  <url>...</url>
  <title>...</title>
  <link>...</link>
</image>
```

## Next Steps for Testing

1. **Start the server:**
   ```bash
   pnpm dev
   ```

2. **Create or update an agent** (if needed)

3. **Upload artwork:**
   ```bash
   curl -X POST http://localhost:3000/agents/{agent-id}/artwork \
     -F "image=@/path/to/artwork.jpg"
   ```

4. **Verify RSS feed** includes artwork:
   ```bash
   curl http://localhost:3000/agents/{agent-id}/feed.xml
   ```

5. **Test with ngrok:**
   ```bash
   npx ngrok http 3000
   ```
   Then get the feed URL at: `{ngrok-url}/agents/{agent-id}/feed.xml`

6. **Submit to Spotify** once you have:
   - ✅ Artwork uploaded (1400x1400+)
   - ✅ Real email in .env (PODCAST_OWNER_EMAIL)
   - ⚠️ At least 1 episode published

## Files Modified

### New Functions
- `src/services/business/agentService.ts`:
  - `uploadArtwork(agentId, buffer)`
  - `deleteArtwork(agentId)`

### Controllers
- `src/controllers/agentController.ts`:
  - `uploadArtwork` 
  - `deleteArtwork`

### Routes
- `src/routes/agents.ts`:
  - `POST /agents/:id/artwork`
  - `DELETE /agents/:id/artwork`

### Configuration
- `src/config/multer.ts`:
  - Added `uploadImage` multer instance
  - Image filter (jpg, jpeg, png)
  - 10MB file size limit

### RSS Service
- `src/services/business/rssFeedService.ts`:
  - Updated `buildConfigFromAgent` to use `agent.podcast_artwork_url`

### Repository Types
- `src/repositories/agentRepository.ts`:
  - Added `podcast_artwork_url` to all interfaces

## Storage Bucket Structure
```
media/
├── artwork/
│   └── agents/
│       └── {agentId}/
│           └── cover.jpg
├── intro/
│   └── agents/{agentId}/intro.mp3
├── outro/
│   └── agents/{agentId}/outro.mp3
├── processed/
│   └── agents/{agentId}/episodes/{episodeId}.mp3
└── raw/
    └── agents/{agentId}/videos/{videoId}.m4a
```
