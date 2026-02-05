/**
 * WebSub Renewal Cron Job
 * Scheduled task to renew expiring WebSub subscriptions.
 */

import cron from 'node-cron';
import { renewExpiringSubscriptions } from '../../services/business/websubRenewalService.js';
import { buildCallbackUrl } from '../../config/websub.js';

/**
 * Starts the WebSub renewal cron job.
 * Runs every 12 hours to renew subscriptions expiring within 24 hours.
 */
export function startWebSubRenewalJob(): void {
  // Schedule: "0 */12 * * *" = At minute 0 past every 12th hour (12am, 12pm)
  cron.schedule('0 */12 * * *', async () => {
    console.log('[WebSub Renewal Job] Starting...');
    try {
      const callbackUrl = buildCallbackUrl();
      await renewExpiringSubscriptions(callbackUrl);
      console.log('[WebSub Renewal Job] ✓ Completed successfully');
    } catch (error) {
      console.error('[WebSub Renewal Job] ✗ Failed:', error);
    }
  });

  console.log('[WebSub Renewal Job] Scheduled (every 12 hours)');
}
