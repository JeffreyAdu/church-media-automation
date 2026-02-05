/**
 * Error Handler Middleware
 * Centralized error handling for Express application.
 */

import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { NODE_ENV } from "../config/env.js";

/**
 * Global error handler middleware.
 * Catches all errors and returns appropriate responses.
 * MUST be registered last in middleware chain.
 */
export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Default to 500 if not an AppError
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const message = error.message || "Internal server error";

  // Log error (in production, send to logging service)
  console.error(`[Error] ${statusCode} - ${message}`, {
    error: error.name,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  // Send response
  const response: any = {
    error: message,
  };

  // Include stack trace in development
  if (NODE_ENV !== "production") {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
}
