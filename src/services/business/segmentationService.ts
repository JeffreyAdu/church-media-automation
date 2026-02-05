/**
 * Segmentation Service
 * Business service for segmentation management.
 */

import { createSegmentation as createSegmentationRepo, Segmentation } from "../../repositories/segmentationRepository.js";

export interface CreateSegmentationInput {
  video_id: string;
  method: "vad_v1" | "llm_v1" | "manual_override";
  sermon_start_sec: number;
  sermon_end_sec: number;
  confidence: number;
  explanation: string;
  approved: boolean;
}

/**
 * Creates a new segmentation record.
 */
export async function createSegmentation(input: CreateSegmentationInput): Promise<Segmentation> {
  return await createSegmentationRepo(input);
}
