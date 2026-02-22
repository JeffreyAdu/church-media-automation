/**
 * OpenAI Configuration
 */

import OpenAI from "openai";

export const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "o3-mini",  /* 80% cheaper, smarter reasoning */
  temperature: 0.7,
  maxTokens: 4096,
};

if (!openaiConfig.apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

export const openaiClient = new OpenAI({
  apiKey: openaiConfig.apiKey,
});
