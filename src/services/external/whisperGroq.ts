/**
 * Groq Whisper Transcription Service
 * Uses Groq's ultra-fast LPU chips for transcription
 * 
 * Pricing: $0.04 per hour of audio
 * Speed: 228x real-time (3hr sermon = 47 seconds)
 * Model: Whisper Large v3 Turbo
 */

import { groqClient } from "../../config/groq.js";
import { createReadStream } from "fs";
import { stat } from "fs/promises";

// Groq SDK has incorrect TypeScript types for verbose_json response
// These fields ARE returned by the API, but not in the SDK types
interface VerboseTranscription {
  task: "transcribe" | "translate";
  language: string;
  duration: number;
  text: string;
  segments: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
}

export type TranscriptSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
};

/**
 * Transcribe audio file using Groq's Whisper Large v3 Turbo
 * Processes at 228x real-time speed
 */
export async function transcribeWithGroq(
  audioPath: string
): Promise<TranscriptResult> {
  const fileStats = await stat(audioPath);
  const fileSizeMB = fileStats.size / (1024 * 1024);
  
  console.log(`[groq] Transcribing ${fileSizeMB.toFixed(2)}MB audio file`);
  console.log(`[groq] Using Whisper Large v3 Turbo on Groq LPU`);
  
  const startTime = Date.now();
  
  try {
    // Create read stream for the audio file
    const audioStream = createReadStream(audioPath) as any;
    
    // Transcribe with verbose_json for segment-level timestamps
    // SDK returns basic type, but actual response has more fields
    const transcription = await groqClient.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-large-v3-turbo",
      language: "en", // Set to undefined for auto-detection
      response_format: "verbose_json", // Get segments with timestamps
      temperature: 0.0, // Deterministic output
    }) as unknown as VerboseTranscription; // Type assertion for correct response shape
    
    const durationSec = (Date.now() - startTime) / 1000;
    const durationMin = Math.floor(durationSec / 60);
    const durationSecRemainder = Math.floor(durationSec % 60);
    
    console.log(
      `[groq] ✓ Transcribed ${transcription.segments.length} segments ` +
      `in ${durationMin}m ${durationSecRemainder}s`
    );
    
    return {
      text: transcription.text,
      segments: transcription.segments,
      language: transcription.language,
      duration: transcription.duration,
    };
    
  } catch (error: any) {
    console.error(`[groq] ✗ Transcription failed:`, error.message);
    
    if (error.status === 401) {
      throw new Error("Invalid Groq API key. Check GROQ_API_KEY environment variable.");
    }
    
    if (error.status === 429) {
      throw new Error("Groq rate limit exceeded. Try again in a moment.");
    }
    
    throw new Error(`Groq transcription failed: ${error.message}`);
  }
}
