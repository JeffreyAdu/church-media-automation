/**
 * OpenAI Configuration
 */

import OpenAI from "openai";

export const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4o",
  transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
  temperature: 0.7,
  maxTokens: 4096,
};

if (!openaiConfig.apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

export const openaiClient = new OpenAI({
  apiKey: openaiConfig.apiKey,
});
