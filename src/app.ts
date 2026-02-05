import express from "express";
import helmet from "helmet";
import cors from "cors";
import { router } from "./routes/index.js";
import { apiLimiter } from "./middlewares/rateLimiting.js";
import { errorHandler } from "./middlewares/errorHandler.js";

/**
 * Express application instance.
 * Configures global middleware and routes.
 */
export const app = express();

/** Disable the X-Powered-By header to reduce fingerprinting. */
app.disable("x-powered-by");

/** Adds standard security headers. */
app.use(helmet());
/** Enables CORS for cross-origin requests. */
app.use(cors());
/** Capture raw body for WebSub signature verification. */
app.use("/webhooks/websub", express.raw({ type: "*/*" }));
/** Parses JSON request bodies with a 10MB limit. */
app.use(express.json({ limit: "10mb" }));

/** Rate limiting for all routes. */
app.use(apiLimiter);

/** Application routes. */
app.use(router);

/** Global error handler - MUST be last. */
app.use(errorHandler);
