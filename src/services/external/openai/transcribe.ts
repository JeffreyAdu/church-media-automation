/**
 * Whisper Transcription with Timestamps
 */

import { openaiClient, openaiConfig } from "../../../config/openai.js";
import { createReadStream } from "fs";

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
 * Transcribes audio file with timestamped segments.
 * Throws if segments are missing or empty.
 */
export async function transcribeWithTimestamps(
  audioPath: string
): Promise<TranscriptResult> {
  const audioStream = createReadStream(audioPath);

  const transcription = await openaiClient.audio.transcriptions.create({
    file: audioStream,
    model: openaiConfig.transcriptionModel,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  if (!transcription.segments || transcription.segments.length === 0) {
    throw new Error(
      "Transcription returned no segments. Timestamps are required for sermon detection."
    );
  }

  const segments: TranscriptSegment[] = transcription.segments.map(
    (seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })
  );

  return {
    text: transcription.text,
    segments,
  };
}
