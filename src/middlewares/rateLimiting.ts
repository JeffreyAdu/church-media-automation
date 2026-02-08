/**
 * Rate Limiting Middleware
 * Prevents API abuse by limiting request rates.
 */

import rateLimit from "express-rate-limit";

/**
 * General API rate limiter for write operations.
 * Limits: 200 requests per 15 minutes per IP.
 * Use for: Updates, uploads, non-sensitive writes.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

/**
 * Strict rate limiter for sensitive operations.
 * Limits: 20 requests per 15 minutes per IP.
 * Use for: Creating/deleting resources, triggering jobs, uploads.
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: "Too many requests, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});
