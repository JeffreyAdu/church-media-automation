/**
 * Image Processing Utilities
 * Validates and resizes images to meet podcast platform requirements.
 */

import sharp from "sharp";
import { BadRequestError } from "./errors.js";

export interface ArtworkRequirements {
  minSize: number;
  maxSize: number;
  aspectRatio: "square";
  format: "jpeg" | "png";
}

/**
 * Spotify/Apple Podcasts artwork requirements
 */
export const PODCAST_ARTWORK_REQUIREMENTS: ArtworkRequirements = {
  minSize: 1400,
  maxSize: 3000,
  aspectRatio: "square",
  format: "jpeg", // Convert all to JPEG for consistency
};

/**
 * Validates and processes podcast artwork to meet platform requirements.
 * - Ensures square aspect ratio (crops if needed)
 * - Upscales if too small OR downscales if too large
 * - Converts to JPEG with high quality
 * - Returns optimized buffer ready for upload
 * 
 * Handles ALL edge cases:
 * - Small images → Upscaled to 1400x1400 (may reduce quality)
 * - Large images → Downscaled to max 3000x3000
 * - Non-square → Cropped to square from center
 * - Any format → Converted to JPEG
 */
export async function processPodcastArtwork(
  buffer: Buffer,
  requirements: ArtworkRequirements = PODCAST_ARTWORK_REQUIREMENTS
): Promise<Buffer> {
  try {
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new BadRequestError("Unable to read image dimensions");
    }

    const { width, height } = metadata;

    // Determine target size based on source dimensions
    const smallestDimension = Math.min(width, height);
    
    let targetSize: number;
    
    if (smallestDimension < requirements.minSize) {
      // Too small: upscale to minimum size
      targetSize = requirements.minSize;
    } else if (smallestDimension > requirements.maxSize) {
      // Too large: downscale to maximum size
      targetSize = requirements.maxSize;
    } else {
      // Just right: use the smallest dimension to ensure square
      targetSize = smallestDimension;
    }

    // Process image:
    // 1. Extract square crop from center (or upscale if needed)
    // 2. Resize to target dimensions
    // 3. Convert to JPEG with high quality
    const processedBuffer = await sharp(buffer)
      .resize(targetSize, targetSize, {
        fit: "cover", // Crop to fill square (or upscale if source is smaller)
        position: "center",
        kernel: "lanczos3", // Best quality for upscaling
      })
      .jpeg({
        quality: 90,
        mozjpeg: true, // Better compression
      })
      .toBuffer();

    return processedBuffer;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw new BadRequestError(`Failed to process artwork: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Validates image dimensions without processing.
 * Useful for checking before upload.
 */
export async function validateArtworkDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new BadRequestError("Unable to read image dimensions");
    }

    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    throw new BadRequestError(`Failed to validate image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
