/**
 * Voice Activity Detection (VAD) Service
 * Detects speech segments in audio files using Silero VAD.
 */

import { NonRealTimeVAD } from "avr-vad";
import { readFile, writeFile, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

export interface SpeechSegment {
  startSec: number;
  endSec: number;
  durationSec: number;
}

/**
 * Custom model fetcher that reads from filesystem instead of using fetch()
 */
async function modelFetcher(modelPath: string): Promise<ArrayBuffer> {
  // Resolve the model path relative to avr-vad package
  const avrVadPath = path.dirname(require.resolve("avr-vad"));
  const fullPath = path.join(avrVadPath, modelPath.replace(/^\//, ""));
  
  console.log(`[VAD] loading model from: ${fullPath}`);
  
  const buffer = await readFile(fullPath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Analyzes audio file for speech activity.
 * Expects 16kHz mono WAV file.
 * Returns all detected speech segments without interpretation.
 * Results are cached to avoid expensive re-processing.
 */
export async function detectSpeech(wavPath: string): Promise<SpeechSegment[]> {
  // Check for cached VAD results
  const cacheDir = path.join(os.tmpdir(), "vad-cache");
  const fileName = path.basename(wavPath, path.extname(wavPath));
  const cachePath = path.join(cacheDir, `${fileName}-vad.json`);
  
  try {
    await access(cachePath);
    console.log("[VAD] using cached results");
    const cached = await readFile(cachePath, "utf-8");
    return JSON.parse(cached);
  } catch {
    // Cache miss, continue with VAD processing
  }
  
  console.log("[VAD] initializing vad");
  
  // Initialize VAD with custom model fetcher for filesystem access
  // Using legacy model - v5 not fully supported by library (different ONNX input format)
  const vad = await NonRealTimeVAD.new({
    modelURL: "/silero_vad_legacy.onnx",
    modelFetcher: modelFetcher,
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
  });

  console.log("[VAD] reading audio file");
  
  // Read WAV file
  const wavBuffer = await readFile(wavPath);
  
  // Convert WAV to Float32Array PCM
  const audioData = wavToFloat32(wavBuffer);
  
  console.log(`[VAD] processing audio: ${audioData.length} samples`);
  
  // Process audio using async generator
  // Merge adjacent segments on-the-fly to prevent memory explosion for long videos
  const segments: SpeechSegment[] = [];
  const speechDataGenerator = vad.run(audioData, 16000);
  
  let lastSegment: SpeechSegment | null = null;
  const mergeThreshold = 0.5; // Merge segments within 0.5 seconds of each other
  
  for await (const speechData of speechDataGenerator) {
    const currentSegment: SpeechSegment = {
      startSec: speechData.start / 1000, // Convert ms to seconds
      endSec: speechData.end / 1000,     // Convert ms to seconds
      durationSec: (speechData.end - speechData.start) / 1000,
    };
    
    // Merge with previous segment if they're adjacent/overlapping
    if (lastSegment && currentSegment.startSec - lastSegment.endSec <= mergeThreshold) {
      lastSegment.endSec = currentSegment.endSec;
      lastSegment.durationSec = lastSegment.endSec - lastSegment.startSec;
    } else {
      // Start a new segment
      if (lastSegment) {
        segments.push(lastSegment);
      }
      lastSegment = currentSegment;
    }
  }
  
  // Push the last segment
  if (lastSegment) {
    segments.push(lastSegment);
  }

  console.log(`[VAD] detected ${segments.length} speech segments`);

  // Cache the results
  try {
    const { mkdir } = await import("fs/promises");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(segments, null, 2));
    console.log("[VAD] cached results for future use");
  } catch (error) {
    console.warn("[VAD] failed to cache results:", error);
  }

  return segments;
}

/**
 * Converts WAV file buffer to Float32Array PCM samples.
 * Assumes 16-bit PCM WAV format.
 */
function wavToFloat32(buffer: Buffer): Float32Array {
  // Skip WAV header (44 bytes for standard WAV)
  const dataOffset = 44;
  const dataLength = (buffer.length - dataOffset) / 2; // 16-bit samples
  
  const float32Array = new Float32Array(dataLength);
  
  for (let i = 0; i < dataLength; i++) {
    const offset = dataOffset + i * 2;
    // Read 16-bit signed integer (little-endian)
    const int16 = buffer.readInt16LE(offset);
    // Normalize to -1.0 to 1.0
    float32Array[i] = int16 / 32768.0;
  }
  
  return float32Array;
}
