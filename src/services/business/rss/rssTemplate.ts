/**
 * RSS Feed XML Template
 * RSS 2.0 with iTunes namespace for podcast feeds.
 */

export const RSS_FEED_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{{TITLE}}</title>
    <link>{{LINK}}</link>
    <description>{{DESCRIPTION}}</description>
    <language>{{LANGUAGE}}</language>
    <lastBuildDate>{{LAST_BUILD_DATE}}</lastBuildDate>
    <itunes:author>{{AUTHOR}}</itunes:author>
    <itunes:owner>
      <itunes:name>{{OWNER_NAME}}</itunes:name>
      <itunes:email>{{OWNER_EMAIL}}</itunes:email>
    </itunes:owner>
    <itunes:image href="{{ITUNES_IMAGE_URL}}"/>
{{IMAGE_TAG}}
    <itunes:category text="{{CATEGORY}}">
      <itunes:category text="{{SUBCATEGORY}}"/>
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
{{ITEMS}}
  </channel>
</rss>`;

export const RSS_ITEM_TEMPLATE = `    <item>
      <title>{{TITLE}}</title>
      <link>{{LINK}}</link>
      <description>{{DESCRIPTION}}</description>
      <enclosure url="{{AUDIO_URL}}" length="{{AUDIO_SIZE}}" type="audio/mpeg"/>
      <guid isPermaLink="false">{{GUID}}</guid>
      <pubDate>{{PUB_DATE}}</pubDate>
      <itunes:duration>{{DURATION}}</itunes:duration>
    </item>`;

export const RSS_IMAGE_TEMPLATE = `    <itunes:image href="{{IMAGE_URL}}"/>
    <image>
      <url>{{IMAGE_URL}}</url>
      <title>{{TITLE}}</title>
      <link>{{LINK}}</link>
    </image>`;
