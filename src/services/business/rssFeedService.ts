/**
 * RSS Feed Service
 * Builds RSS 2.0 + iTunes podcast feeds for agents.
 */

import { escapeXml, formatDuration, formatRssDate } from "../../utils/rssXml.js";
import { RSS_FEED_TEMPLATE, RSS_ITEM_TEMPLATE, RSS_IMAGE_TEMPLATE } from "./rss/rssTemplate.js";
import type { Agent } from "../../repositories/agentRepository.js";
import type { Episode } from "../../repositories/episodeRepository.js";

export interface RssFeedConfig {
  title: string;
  description: string;
  link: string;
  language: string;
  author: string;
  ownerName: string;
  ownerEmail: string;
  imageUrl: string | null;
  category: string;
}

/**
 * Builds RSS 2.0 XML feed with iTunes namespace.
 */
export function buildRssFeed(config: RssFeedConfig, episodes: Episode[]): string {
  const now = formatRssDate(new Date());

  const items = episodes
    .map((ep) => {
      const title = escapeXml(ep.title);
      const description = escapeXml(ep.description || "");
      const audioUrl = escapeXml(ep.audio_url);
      const guid = escapeXml(ep.guid);
      const pubDate = formatRssDate(ep.published_at);
      const duration = ep.duration_seconds ? formatDuration(ep.duration_seconds) : "00:00:00";

      return RSS_ITEM_TEMPLATE
        .replace("{{TITLE}}", title)
        .replace("{{DESCRIPTION}}", description)
        .replace("{{AUDIO_URL}}", audioUrl)
        .replace("{{AUDIO_SIZE}}", ep.audio_size_bytes.toString())
        .replace("{{GUID}}", guid)
        .replace("{{PUB_DATE}}", pubDate)
        .replace("{{DURATION}}", duration);
    })
    .join("\n");

  const imageTag = config.imageUrl
    ? RSS_IMAGE_TEMPLATE
        .replace(/{{IMAGE_URL}}/g, escapeXml(config.imageUrl))
        .replace("{{TITLE}}", escapeXml(config.title))
        .replace("{{LINK}}", escapeXml(config.link))
    : "";

  return RSS_FEED_TEMPLATE
    .replace("{{TITLE}}", escapeXml(config.title))
    .replace("{{LINK}}", escapeXml(config.link))
    .replace("{{DESCRIPTION}}", escapeXml(config.description))
    .replace("{{LANGUAGE}}", config.language)
    .replace("{{LAST_BUILD_DATE}}", now)
    .replace("{{AUTHOR}}", escapeXml(config.author))
    .replace("{{OWNER_NAME}}", escapeXml(config.ownerName))
    .replace("{{OWNER_EMAIL}}", escapeXml(config.ownerEmail))
    .replace("{{IMAGE_TAG}}", imageTag)
    .replace("{{CATEGORY}}", escapeXml(config.category))
    .replace("{{ITEMS}}", items);
}

/**
 * Builds RSS feed config from agent data.
 */
export function buildConfigFromAgent(agent: Agent, baseUrl: string): RssFeedConfig {
  const podcastTitle = agent.podcast_title || agent.name;
  return {
    title: podcastTitle,
    description: agent.podcast_description || `Sermons from ${podcastTitle}`,
    link: agent.youtube_channel_url || baseUrl,
    language: "en-us",
    author: agent.podcast_author || podcastTitle,
    ownerName: agent.podcast_author || podcastTitle,
    ownerEmail: process.env.PODCAST_OWNER_EMAIL || "podcast@example.com",
    imageUrl: agent.podcast_artwork_url, // Podcast cover art (1400x1400-3000x3000 for Spotify)
    category: "Religion & Spirituality",
  };
}
