/**
 * Error Message Utility
 * Converts technical errors into user-friendly messages
 */

/**
 * Converts technical error to generic user-friendly message
 */
export function getGenericErrorMessage(error: unknown): string {
  const errorStr = String(error).toLowerCase();

  // YouTube/Download errors
  if (errorStr.includes('unavailable') || errorStr.includes('not available') || errorStr.includes('404')) {
    return 'Video unavailable';
  }
  if (errorStr.includes('private') || errorStr.includes('403')) {
    return 'Video is private';
  }
  if (errorStr.includes('copyright') || errorStr.includes('blocked')) {
    return 'Video blocked';
  }
  if (errorStr.includes('yt-dlp') || errorStr.includes('youtube-dl') || errorStr.includes('download')) {
    return 'Download failed';
  }

  // Processing errors
  if (errorStr.includes('ffmpeg') || errorStr.includes('audio') || errorStr.includes('convert')) {
    return 'Audio processing failed';
  }
  if (errorStr.includes('transcri') || errorStr.includes('openai') || errorStr.includes('whisper')) {
    return 'Transcription failed';
  }
  if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
    return 'Processing timeout';
  }

  // Storage errors
  if (errorStr.includes('storage') || errorStr.includes('upload') || errorStr.includes('supabase')) {
    return 'Upload failed';
  }

  // Generic fallback
  return 'Processing failed';
}
