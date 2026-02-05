/**
 * WebSub Controller
 * Handles YouTube WebSub webhook callbacks and hub verification.
 */

import { Request, Response } from "express";
import { processYouTubeNotification } from "../services/business/videoService.js";

/**
 * Hub verification intent handler.
 * YouTube calls this with query params to verify the subscription.
 * Must respond with hub.challenge for successful verification.
 */
export async function verifyIntent(req: Request, res: Response): Promise<void> {
  const mode = req.query["hub.mode"];
  const topic = req.query["hub.topic"];
  const challenge = req.query["hub.challenge"];
  const leaseSeconds = req.query["hub.lease_seconds"];

  console.log("WebSub verification request:", {
    mode,
    topic,
    leaseSeconds,
  });

  // Validate mode is subscribe or unsubscribe
  if (mode !== "subscribe" && mode !== "unsubscribe") {
    res.status(400).send("Invalid hub.mode");
    return;
  }

  // Validate topic is a YouTube channel feed
  if (!topic || typeof topic !== "string" || !topic.includes("youtube.com")) {
    res.status(400).send("Invalid hub.topic");
    return;
  }

  // Validate challenge exists
  if (!challenge || typeof challenge !== "string") {
    res.status(400).send("Missing hub.challenge");
    return;
  }

  // Respond with the challenge to confirm subscription
  res.status(200).type("text/plain").send(challenge);
  
  console.log(`✓ WebSub ${mode} verified for ${topic}`);
}

/**
 * Notification handler.
 * YouTube POSTs Atom XML when a new video is uploaded.
 * Must respond 200 quickly and process asynchronously.
 */
export async function handleNotification(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body.toString("utf8");
    const signature = req.headers["x-hub-signature"] as string | undefined;
    
    // Respond 200 immediately to acknowledge receipt
    res.status(200).send();

    // Process notification asynchronously via service layer
    setImmediate(() => processYouTubeNotification(body, signature));
    
  } catch (error) {
    console.error("WebSub notification error:", error);
    // Still respond 200 to avoid retries for unrecoverable errors
    res.status(200).send();
  }
}
