/**
 * HTTP Server Entry Point
 * Initializes and starts the Express application on a specified port.
 * Handles graceful shutdown on SIGTERM signal.
 */
import "dotenv/config";
import { createServer } from "http";
import { app } from "./app.js";
import { initializeApp } from "./config/init.js";
import { startWebSubRenewalJob } from "./jobs/crons/websubRenewal.js";
import { PORT } from "./config/env.js";

/** HTTP server instance wrapping the Express application. */
const server = createServer(app);

/** Tracks whether application initialization is complete. */
let isReady = false;

/**
 * Starts the HTTP server immediately.
 * Initialization runs in parallel without blocking server startup.
 */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
  
  // Run initialization after server starts
  initializeApp()
    .then(() => {
      isReady = true;
      
      // Start background jobs after initialization
      startWebSubRenewalJob();
      
      console.log("✓ Server ready to accept requests\n");
    })
    .catch((error) => {
      console.error("✗ Initialization failed:", error);
      process.exit(1);
    });
});

/**
 * Handles graceful shutdown on SIGTERM signal.
 * Closes the server and exits the process cleanly.
 */
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
