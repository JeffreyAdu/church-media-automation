/**
 * Authentication Middleware
 * Validates Supabase JWT tokens and extracts user ID
 */

import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase.js";
import { AppError } from "../utils/errors.js";

// User type is extended in src/types/express.d.ts

/**
 * Middleware to verify Supabase JWT token and extract user
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("No authorization token provided", 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new AppError("Invalid or expired token", 401);
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email || '',
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(401).json({ error: "Authentication failed" });
    }
  }
}

/**
 * Optional auth - doesn't fail if no token, just doesn't set userId
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      const {
        data: { user },
      } = await supabase.auth.getUser(token);

      if (user) {
        req.userId = user.id;
        req.userEmail = user.email;
      }
    }

    next();
  } catch (error) {
    // Continue without auth
    next();
  }
}
