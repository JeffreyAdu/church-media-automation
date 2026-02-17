/**
 * Media Transcription Service
 * Quality-first approach: Always use 64kbps speech-optimized compression
 * Strategy: Compress at 64kbps → If still >95MB → Smart chunking
 */

import { stat, unlink } from 'fs/promises';
import { transcribeWithGroq } from '../external/whisperGroq.js';
import { compressForStt, getAudioDuration } from '../../utils/audioCompression.js';
import { splitIntoChunks } from '../../utils/audioChunking.js';
import type { TranscriptResult, TranscriptSegment } from '../external/whisperGroq.js';

const TARGET_SIZE_MB = 95; // Groq Developer tier: 100MB limit (stay safely under)

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
    
    // Step 1: Always compress for STT (64kbps speech-optimized with filters)
    const compressedPath = await compressForStt(audioPath);
    cleanupPaths.push(compressedPath);
    
    const compressedStats = await stat(compressedPath);
    const compressedSizeMB = compressedStats.size / (1024 * 1024);
    
    // Step 2: Check if compressed file fits Groq's limit
    if (compressedSizeMB <= TARGET_SIZE_MB) {
      console.log(
        `[transcribe] ✓ Compressed file is ${compressedSizeMB.toFixed(2)}MB ` +
        `- transcribing as single file`
      );
      
      return await transcribeWithGroq(compressedPath);
    }
    
    // Step 3: File still too large → Use chunking strategy
    console.log(
      `[transcribe] Compressed file is ${compressedSizeMB.toFixed(2)}MB ` +
      `(exceeds ${TARGET_SIZE_MB}MB) - using chunking strategy`
    );
    
    const chunks = await splitIntoChunks(audioPath, duration);
    cleanupPaths.push(...chunks);
    
    // Step 4: Transcribe each chunk
    const chunkResults: TranscriptResult[] = [];
    
    for (const [index, chunkPath] of chunks.entries()) {
      console.log(`[transcribe] Transcribing chunk ${index + 1}/${chunks.length}...`);
      const result = await transcribeWithGroq(chunkPath);
      chunkResults.push(result);
    }
    
    // Step 5: Merge all chunks into single transcript
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
