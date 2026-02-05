/**
 * WebSub Routes
 * Handles YouTube webhook callbacks via WebSub protocol.
 */

import { Router } from "express";
import { verifyIntent, handleNotification } from "../controllers/websubController.js";

export const websubRouter = Router();

/** Hub handshake for subscription verification */
websubRouter.get("/webhooks/websub", verifyIntent);

/** Receives video upload notifications from YouTube */
websubRouter.post("/webhooks/websub", handleNotification);
