# WebSub Subscription Renewal

## Overview
WebSub subscriptions have a configurable lease period (default: 10 days). This system automatically renews subscriptions before they expire to ensure continuous YouTube notifications.

## Architecture

### Components

#### 1. Subscription Metadata Tracking
- **Location**: `agents` table
- **Fields**:
  - `websub_topic_url`: YouTube feed URL
  - `websub_callback_url`: Our webhook endpoint
  - `websub_lease_seconds`: Lease duration in seconds
  - `websub_expires_at`: Calculated expiration timestamp (lease - 1h buffer)
  - `websub_status`: `subscribed`, `expired`, or `error`

#### 2. Renewal Service
- **Location**: `src/services/business/websubRenewalService.ts`
- **Function**: `renewExpiringSubscriptions(callbackUrl: string)`
- **Logic**:
  1. Fetch all agents from database
  2. Filter for active agents with subscriptions expiring within 24 hours
  3. Re-subscribe to each expiring subscription (renewal = re-subscribe in WebSub)
  4. Update metadata with new expiration time
  5. Log results (renewed count, failed count)

#### 3. Cron Scheduler
- **Location**: `src/config/scheduler.ts`
- **Schedule**: Every 12 hours (`0 */12 * * *`)
- **Initialization**: Called from `src/config/init.ts` during app startup

#### 4. Manual Activation Endpoint
- **Route**: `POST /agents/:id/activate`
- **Purpose**: Manually renew/activate a subscription
- **Use Cases**:
  - Force renewal before auto-renewal kicks in
  - Recover from subscription errors
  - Re-activate a failed subscription
  - Test subscription flow

## Configuration

### Environment Variables
```env
WEBSUB_LEASE_SECONDS=864000  # 10 days (default)
```

### Expiration Buffer
- **Buffer**: 1 hour before actual lease expiration
- **Calculation**: `expiresAt = now + (leaseSeconds - 3600)`
- **Reason**: Ensures renewal happens before expiration, accounting for delays

### Renewal Window
- **Window**: 24 hours before expiration
- **Schedule**: Every 12 hours
- **Coverage**: Multiple renewal attempts before expiration

## Flow Diagrams

### Initial Subscription (Agent Creation)
```
POST /agents
  ↓
createAgent()
  ↓
createAgentRepo() → Create DB record
  ↓
subscribe() → POST to YouTube hub
  ↓
updateAgentRepo() → Save metadata:
  - websub_expires_at: now + (lease - 1h)
  - websub_topic_url: channel feed URL
  - websub_status: "subscribed"
```

### Automatic Renewal (Cron)
```
Every 12 hours
  ↓
renewExpiringSubscriptions()
  ↓
Find agents expiring < 24h
  ↓
For each agent:
  subscribe() → Re-subscribe to hub
  ↓
  updateAgentRepo() → Update metadata:
    - websub_expires_at: new expiration
    - websub_status: "subscribed" or "error"
```

### Manual Activation
```
POST /agents/:id/activate
  ↓
activateAgent()
  ↓
findById() → Fetch agent
  ↓
subscribe() → Re-subscribe to hub
  ↓
updateAgentRepo() → Update metadata + set status="active"
```

## Testing

### 1. Verify Metadata After Agent Creation
```bash
# Create an agent
POST http://localhost:3000/agents
{
  "name": "Test Channel",
  "youtube_channel_id": "UC...",
  "rss_slug": "test-channel"
}

# Check the agent record
GET http://localhost:3000/agents/:id

# Verify response contains:
# - websub_expires_at: ~10 days from now
# - websub_topic_url: YouTube feed URL
# - websub_status: "subscribed"
```

### 2. Test Manual Activation
```bash
# Manually renew a subscription
POST http://localhost:3000/agents/:id/activate

# Verify response shows updated websub_expires_at
```

### 3. Monitor Cron Logs
```
[Scheduler] ✓ Cron jobs initialized (WebSub renewal: every 12h)
...
[Scheduler] Starting WebSub renewal task...
[WebSub Renewal] Found 5 agents, 2 expiring within 24 hours
✓ Renewed subscription for channel UC... (new expiry: 2025-02-05T15:30:00Z)
[Scheduler] ✓ WebSub renewal task completed
```

### 4. Test Expiration Logic
To test renewal without waiting 10 days:

1. Temporarily set `WEBSUB_LEASE_SECONDS=300` (5 minutes)
2. Create an agent
3. Wait 3-4 minutes
4. Verify renewal service detects the expiring subscription
5. Verify metadata updates with new expiration time

## Troubleshooting

### Subscription Status: "error"
**Cause**: subscribe() call failed during creation/renewal  
**Solution**: POST /agents/:id/activate to retry

### No Renewals Detected
**Cause**: No subscriptions expiring within 24h  
**Solution**: Normal behavior; wait for subscriptions to age

### Cron Not Running
**Check**: `startScheduler()` called from `src/config/init.ts`  
**Verify**: Look for "[Scheduler] ✓ Cron jobs initialized" in startup logs

### Hub Rejects Renewal
**Cause**: Hub may reject too-early renewals  
**Note**: WebSub spec allows renewal anytime; hub-specific behavior varies

## Best Practices

1. **Monitor websub_status**: Set up alerts for agents with status="error"
2. **Log renewals**: All renewals are logged with timestamps
3. **Buffer time**: 1-hour buffer prevents last-minute failures
4. **Multiple attempts**: 12-hour schedule provides 2 attempts in 24-hour window
5. **Manual recovery**: Use POST /agents/:id/activate for failed subscriptions

## Production Deployment

### Pre-deployment Checklist
- [ ] `WEBSUB_LEASE_SECONDS` configured (default: 864000)
- [ ] Scheduler initialized in production build
- [ ] Monitoring/logging enabled for cron tasks
- [ ] Alert system for agents with status="error"

### Post-deployment Verification
1. Create a test agent
2. Verify metadata saved correctly
3. Monitor logs for first cron run (within 12 hours)
4. Test manual activation endpoint

## References

- WebSub Spec: https://www.w3.org/TR/websub/
- YouTube WebSub: https://developers.google.com/youtube/v3/guides/push_notifications
- node-cron: https://www.npmjs.com/package/node-cron
