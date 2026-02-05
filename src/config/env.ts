/**
 * Environment Configuration
 * Validates and exports type-safe environment variables.
 * Fails fast at startup if required variables are missing.
 */

/** Server configuration */
export const PORT = parseInt(process.env.PORT || "3000", 10);
export const NODE_ENV = process.env.NODE_ENV || "development";
/** Optional public base URL (e.g., ngrok) used for building callbacks */
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

/** Supabase configuration */
export const SUPABASE_URL = getRequiredEnv("SUPABASE_URL");
export const SUPABASE_SERVICE_ROLE_KEY = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

/** WebSub configuration */
export const WEBSUB_HUB_URL = getRequiredEnv("WEBSUB_HUB_URL");
export const WEBSUB_CALLBACK_PATH = getRequiredEnv("WEBSUB_CALLBACK_PATH");
export const WEBSUB_LEASE_SECONDS = process.env.WEBSUB_LEASE_SECONDS;
export const WEBSUB_SECRET = getRequiredEnv("WEBSUB_SECRET");

/** Redis configuration (BullMQ) */
export const REDIS_URL = getRequiredEnv("REDIS_URL");

/**
 * Helper to safely retrieve required environment variables.
 * Throws immediately if variable is missing.
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
