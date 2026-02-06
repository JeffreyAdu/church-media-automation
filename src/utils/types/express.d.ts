/**
 * Express Request type extensions
 * Extends the Express Request interface to include custom properties
 */

declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      email: string;
      role?: string;
    };
  }
}
