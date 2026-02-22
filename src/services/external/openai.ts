/**
 * OpenAI External Service
 * Handles transcription and JSON agent interactions.
 */

import { openaiClient, openaiConfig } from "../../config/openai.js";

export interface JsonAgentParams {
  agentName: string;
  systemPrompt: string;
  input: any;
}

/**
 * Runs an OpenAI agent that returns strict JSON output.
 * Returns raw parsed JSON - validation is the caller's responsibility.
 */
export async function runJsonAgent(params: JsonAgentParams): Promise<any> {
  const { agentName, systemPrompt, input } = params;

  const response = await openaiClient.chat.completions.create({
    model: openaiConfig.model,
    temperature: openaiConfig.temperature,
    max_tokens: openaiConfig.maxTokens,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: typeof input === "string" ? input : JSON.stringify(input),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`[${agentName}] No response from OpenAI`);
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`[${agentName}] Invalid JSON response: ${content}`);
  }
}
