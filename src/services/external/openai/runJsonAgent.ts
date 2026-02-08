/**
 * JSON Agent Runner
 * Uses OpenAI Agents SDK with strict JSON output validation.
 */

import { Agent, run } from "@openai/agents";
import { openaiConfig } from "../../../config/openai.js";
import { z } from "zod";

type RunJsonAgentParams<T> = {
  agentName: string;
  systemPrompt: string;
  input: unknown;
  schema: z.ZodType<T>;
};

/**
 * Runs an AI agent that returns strictly validated JSON.
 * Throws if JSON is invalid or doesn't match schema.
 */
export async function runJsonAgent<T>(
  params: RunJsonAgentParams<T>
): Promise<T> {
  const { agentName, systemPrompt, input, schema } = params;

  // Create agent with instructions and model
  const agent = new Agent({
    name: agentName,
    instructions: systemPrompt,
    model: openaiConfig.model,
  });

  // Convert input to string format
  const inputString = typeof input === "string" ? input : JSON.stringify(input);

  // Diagnostic logging for large inputs
  const inputTokenEstimate = Math.ceil(inputString.length / 4); // Rough estimate: 4 chars ≈ 1 token
  console.log(`[${agentName}] Input size: ${inputString.length} chars (~${inputTokenEstimate} tokens)`);
  if (inputTokenEstimate > 50000) {
    console.warn(`[${agentName}] ⚠️ Very large input (${inputTokenEstimate} tokens) - may hit context limits or cause poor quality responses`);
  }

  // Run agent with input (temperature/maxTokens controlled by model defaults)
  const result = await run(agent, inputString);

  // Extract final output text (finalOutput is already a string)
  const content = result.finalOutput;
  if (!content) {
    throw new Error(`[${agentName}] No response from agent`);
  }

  // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
  let cleanContent = content.trim();
  const codeBlockMatch = cleanContent.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (codeBlockMatch) {
    cleanContent = codeBlockMatch[1].trim();
  }

  // Parse JSON strictly
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanContent);
  } catch (err) {
    throw new Error(
      `[${agentName}] Invalid JSON response: ${content.slice(0, 200)}`
    );
  }

  // Validate with Zod schema
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `[${agentName}] JSON validation failed: ${validated.error.message}`
    );
  }

  return validated.data;
}
