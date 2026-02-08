# YouTube Cookie Authentication Setup

## Problem

YouTube blocks automated requests from cloud IPs (like Fly.io) with:
```
ERROR: Sign in to confirm you're not a bot
```

Using cookies from an authenticated YouTube session bypasses bot detection.

## Prerequisites

- A web browser (Chrome, Firefox, Edge, etc.)
- Signed into YouTube with a Google account
- [Cookies.txt browser extension](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) (Chrome) or [equivalent](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

## Step 1: Export YouTube Cookies

### Using Browser Extension (Recommended)

1. **Install Extension**
   - Chrome: [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. **Export Cookies**
   - Navigate to `https://www.youtube.com`
   - Click the extension icon
   - Click "Export" or "Current Site"
   - Save as `youtube-cookies.txt`

3. **Verify Format**
   The file should look like:
   ```
   # Netscape HTTP Cookie File
   .youtube.com	TRUE	/	TRUE	1234567890	CONSENT	YES+...
   .youtube.com	TRUE	/	FALSE	1234567890	VISITOR_INFO1_LIVE	abcd1234_...
   ```

### Using Browser DevTools (Alternative)

1. Open YouTube in browser (signed in)
2. Press F12 → Network tab → Reload page
3. Click any request → Headers → Copy all `Cookie:` values
4. Format manually to Netscape format (not recommended)

## Step 2: Store in Fly.io Secrets

### Method 1: Direct Upload (Recommended)

```bash
# Navigate to project directory
cd church-media-automation

# Set secret from file (will preserve newlines)
flyctl secrets set YOUTUBE_COOKIES="$(cat youtube-cookies.txt)" -a church-media-automation
```

### Method 2: Interactive Editor

```bash
# Open Fly.io secrets editor
flyctl secrets set YOUTUBE_COOKIES="" -a church-media-automation

# Paste entire contents of youtube-cookies.txt when prompted
# Press Ctrl+D (Unix) or Ctrl+Z (Windows) to finish
```

### Verify Secret

```bash
# List secrets (won't show values, just confirms it exists)
flyctl secrets list -a church-media-automation
```

Should show:
```
NAME              DIGEST          CREATED AT
YOUTUBE_COOKIES   abc123...       1m ago
```

## Step 3: Deploy

```bash
# Deploy with new secrets
flyctl deploy -a church-media-automation
```

Logs should show:
```
[youtube-dl] ✓ YouTube cookies initialized at /tmp/youtube-cookies.txt
```

## Step 4: Test

Trigger a backfill from your frontend. Logs should NOT show bot detection errors:

```bash
# Watch logs
flyctl logs -a church-media-automation
```

✅ **Success**: Videos download without errors
❌ **Still failing**: Check troubleshooting below

## Maintenance

### Cookie Expiration

- **Lifespan**: YouTube cookies typically last **3-6 months**
- **Signs of expiration**:
  - Bot detection errors return
  - Metadata fetching fails
  - All downloads fail simultaneously

### Refresh Procedure

1. Sign out/sign in to YouTube in your browser
2. Export fresh cookies (Step 1)
3. Update Fly.io secret (Step 2)
4. No redeploy needed - app auto-reloads secrets

### Automation (Optional)

For long-running production:
```bash
# Add to weekly cron
0 0 * * 0 bash -c 'cd ~/church_app/church-media-automation && flyctl secrets set YOUTUBE_COOKIES="$(cat youtube-cookies.txt)"'
```

## Troubleshooting

### "No YOUTUBE_COOKIES env var found"

- Secret not set or typo in name
- Run: `flyctl secrets list -a church-media-automation`
- Redeploy if needed

### "Failed to write cookies file"

- File system permissions issue
- Check `/tmp` is writable in container
- Verify secret contains valid Netscape format

### Still Getting Bot Detection

1. **Verify cookie format**
   ```bash
   # SSH into Fly.io machine
   flyctl ssh console -a church-media-automation
   
   # Check cookie file
   cat /tmp/youtube-cookies.txt
   ```

2. **Try fresh export**
   - Clear browser cookies entirely
   - Sign in to YouTube again
   - Export fresh cookies

3. **Check IP reputation**
   - Fly.io IPs may be flagged
   - Consider adding delays between downloads
   - Contact Fly.io support about IP blocks

### Downloads Work Locally, Fail on Fly.io

- Local uses your home IP (not flagged)
- Fly.io uses datacenter IPs (YouTube watches these)
- Cookies are **required** for cloud deployments

## Security Notes

- **Never commit** `youtube-cookies.txt` to Git
- Already in `.gitignore` (verify with `git status`)
- Cookies grant full YouTube access
- Rotate if compromised
- Use an account without payment methods

## Alternative: YouTube Data API

If cookie management is too burdensome:

1. Get [YouTube Data API key](https://console.cloud.google.com/apis/credentials)
2. Switch to official API (10,000 units/day free)
3. Trade-offs:
   - ✅ No bot detection
   - ✅ Official, stable
   - ❌ Quota limits
   - ❌ No direct download URLs

## Resources

- [yt-dlp Cookie Authentication FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)
- [YouTube Cookie Export Guide](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
- [Fly.io Secrets Docs](https://fly.io/docs/reference/secrets/)
