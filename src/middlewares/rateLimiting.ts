/**
 * Rate Limiting Middleware
 * Prevents API abuse by limiting request rates.
 */

import rateLimit from "express-rate-limit";

/**
 * General API rate limiter.
 * Limits: 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

/**
 * Strict rate limiter for sensitive operations.
 * Limits: 10 requests per 15 minutes per IP.
 * Use for: Creating/deleting resources, triggering external actions.
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many requests, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});
