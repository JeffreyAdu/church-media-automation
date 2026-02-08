/**
 * Local Whisper Transcription Service
 * Uses faster-whisper (Python) for CPU-based transcription.
 * No file size limits, no API costs, runs directly on worker machines.
 */

import { execa } from "execa";
import { stat } from "fs/promises";

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
};

/**
 * Transcribes audio file using local faster-whisper model.
 * Handles arbitrarily large files without chunking.
 * 
 * Performance: ~2-3x real-time on shared-cpu-2x
 * Example: 90min sermon = ~30-45min transcription time
 */
export async function transcribeWithWhisperLocal(
  audioPath: string
): Promise<TranscriptResult> {
  const fileStats = await stat(audioPath);
  const fileSizeMB = fileStats.size / (1024 * 1024);
  
  console.log(`[whisper-local] Transcribing ${fileSizeMB.toFixed(2)}MB audio file`);
  console.log(`[whisper-local] Using faster-whisper (small model, CPU, int8)`);
  
  const startTime = Date.now();
  
  try {
    // Run Python script that uses faster-whisper
    const result = await execa('python3', [
      '-c',
      `
import json
import sys
from faster_whisper import WhisperModel

# Load model (small = good balance of speed/accuracy for sermons)
# device="cpu" works on Fly.io shared-cpu instances
# compute_type="int8" reduces memory usage
model = WhisperModel("small", device="cpu", compute_type="int8")

# Transcribe with segment-level timestamps
segments_list, info = model.transcribe(
    "${audioPath}",
    beam_size=5,
    word_timestamps=False,
    vad_filter=False  # We already did VAD, don't filter again
)

# Convert generator to list and format output
output = {
    "segments": [],
    "text": ""
}

full_text = []
for segment in segments_list:
    output["segments"].append({
        "start": segment.start,
        "end": segment.end,
        "text": segment.text.strip()
    })
    full_text.append(segment.text.strip())

output["text"] = " ".join(full_text)

# Print JSON to stdout
print(json.dumps(output))
      `
    ], {
      timeout: 3600000, // 1 hour timeout (long sermons take time)
    });
    
    const transcription = JSON.parse(result.stdout);
    
    const durationSec = (Date.now() - startTime) / 1000;
    const durationMin = Math.floor(durationSec / 60);
    const durationSecRemainder = Math.floor(durationSec % 60);
    
    console.log(`[whisper-local] ✓ Transcribed ${transcription.segments.length} segments in ${durationMin}m ${durationSecRemainder}s`);
    
    return {
      text: transcription.text,
      segments: transcription.segments as TranscriptSegment[],
    };
    
  } catch (error: any) {
    console.error(`[whisper-local] ✗ Transcription failed:`, error.message);
    
    if (error.stderr) {
      console.error(`[whisper-local] Python stderr:`, error.stderr);
    }
    
    throw new Error(`Local Whisper transcription failed: ${error.message}`);
  }
}
