/**
 * Media Transcription Service
 * Compress to 64kbps MP3 16kHz mono → route by size:
 *   ≤24MB → direct upload to Groq
 *   >24MB → chunk into ≤24MB pieces, transcribe each, merge
 */

import { stat, unlink } from 'fs/promises';
import { transcribeWithGroq } from '../external/whisperGroq.js';
import { compressForStt, getAudioDuration } from '../../utils/audioCompression.js';
import { splitIntoChunks } from '../../utils/audioChunking.js';
import type { TranscriptResult, TranscriptSegment } from '../external/whisperGroq.js';

const CHUNK_THRESHOLD_MB = 24; // Groq hard limit is 25MB — chunk anything above this

/**
 * Merge transcription results from multiple chunks
 * Adjusts timestamps to create seamless merged transcript
 */
function mergeTranscripts(chunkResults: TranscriptResult[]): TranscriptResult {
  console.log(`[merging] Combining ${chunkResults.length} chunk transcripts...`);
  
  let cumulativeOffset = 0;
  const mergedSegments: TranscriptSegment[] = [];
  const mergedTexts: string[] = [];
  
  for (const [index, result] of chunkResults.entries()) {
    // Adjust timestamps by cumulative offset
    const adjustedSegments = result.segments.map(seg => ({
      ...seg,
      start: seg.start + cumulativeOffset,
      end: seg.end + cumulativeOffset,
    }));
    
    mergedSegments.push(...adjustedSegments);
    mergedTexts.push(result.text);
    
    // Update offset for next chunk
    cumulativeOffset += result.duration;
    
    console.log(
      `[merging] Chunk ${index + 1}: ${result.segments.length} segments, ` +
      `offset now ${(cumulativeOffset / 60).toFixed(1)}min`
    );
  }
  
  console.log(`[merging] ✓ Final transcript: ${mergedSegments.length} segments total`);
  
  return {
    text: mergedTexts.join(' '),
    segments: mergedSegments,
    language: chunkResults[0]?.language || 'en',
    duration: cumulativeOffset,
  };
}

/**
 * Main transcription function
 * Quality-first: Always 128kbps, chunk if needed
 */
export async function transcribe(audioPath: string): Promise<TranscriptResult> {
  let cleanupPaths: string[] = [];
  
  try {
    const originalStats = await stat(audioPath);
    const originalSizeMB = originalStats.size / (1024 * 1024);
    const duration = await getAudioDuration(audioPath);
    const durationMinutes = duration / 60;
    
    console.log(
      `[transcribe] Input: ${originalSizeMB.toFixed(2)}MB, ` +
      `${durationMinutes.toFixed(1)}min duration`
    );
    
    // Step 1: Compress to 64kbps MP3 16kHz mono
    // Typically reduces 174min service from ~120MB to ~79MB
    const compressedPath = await compressForStt(audioPath);
    cleanupPaths.push(compressedPath);

    const compressedStats = await stat(compressedPath);
    const compressedSizeMB = compressedStats.size / (1024 * 1024);

    console.log(`[transcribe] ${originalSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB MP3`);

    // Step 2: Route by size — transcribeWithGroq handles direct vs URL internally
    if (compressedSizeMB <= CHUNK_THRESHOLD_MB) {
      return await transcribeWithGroq(compressedPath);
    }

    // Step 3: File >95MB even after compression (sermon >6hrs) → chunk original, transcribe each
    console.log(
      `[transcribe] Compressed MP3 is ${compressedSizeMB.toFixed(2)}MB (exceeds ${CHUNK_THRESHOLD_MB}MB) — chunking`
    );

    const chunks = await splitIntoChunks(audioPath, duration);
    cleanupPaths.push(...chunks);

    const chunkResults: TranscriptResult[] = [];
    for (const [index, chunkPath] of chunks.entries()) {
      console.log(`[transcribe] Transcribing chunk ${index + 1}/${chunks.length}...`);
      const result = await transcribeWithGroq(chunkPath);
      chunkResults.push(result);
    }

    return mergeTranscripts(chunkResults);
    
  } finally {
    // Cleanup all temporary files
    console.log(`[transcribe] Cleaning up ${cleanupPaths.length} temporary files...`);
    for (const tempPath of cleanupPaths) {
      await unlink(tempPath).catch((err) => {
        console.warn(`[transcribe] Failed to cleanup ${tempPath}:`, err.message);
      });
    }
  }
}
