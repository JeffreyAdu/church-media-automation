/**
 * Groq Configuration
 * Groq provides ultra-fast Whisper transcription via LPU chips
 * Pricing: $0.04 per hour of audio
 * Speed: 228x real-time
 */

import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("GROQ_API_KEY environment variable is required");
}

export const groqClient = new Groq({
  apiKey,
});




