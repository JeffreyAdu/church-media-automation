/**
 * RSS XML Utilities
 * Helpers for building valid RSS 2.0 + iTunes podcast feeds.
 */

/**
 * Escapes special XML characters.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escapes content for CDATA sections.
 * CDATA can contain any characters except "]]>", so we need to break it if that appears.
 */
export function escapeCdata(str: string): string {
  // Split CDATA end marker to prevent breaking out of CDATA
  return str.replace(/]]>/g, "]]]]><![CDATA[>");
}

/**
 * Formats duration in seconds to HH:MM:SS for iTunes.
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    secs.toString().padStart(2, "0"),
  ].join(":");
}

/**
 * Formats a date to RFC 2822 format for RSS pubDate.
 */
export function formatRssDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toUTCString();
}
