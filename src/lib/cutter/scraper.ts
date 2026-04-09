const YT_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    const isRetryable = err instanceof Error && (
      err.name === 'TimeoutError' ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('fetch failed')
    );
    if (!isRetryable) throw err;
    await new Promise((r) => setTimeout(r, 500));
    return withRetry(fn, retries - 1);
  }
}

export type ScrapeResult =
  | { views: number; title?: string; error?: undefined }
  | { views: null; title?: undefined; error: string };

export async function scrapeVideoViews(
  platform: string,
  externalId: string,
  url: string,
  oauthToken?: string,
  instagramUserId?: string
): Promise<ScrapeResult> {
  try {
    let result: { views: number; title?: string } | null = null;
    switch (platform) {
      case 'youtube':
        result = await scrapeYouTube(externalId);
        break;
      case 'tiktok':
        result = await scrapeTikTok(url);
        break;
      case 'instagram':
        result = await scrapeInstagram(url, oauthToken, instagramUserId);
        break;
      case 'facebook':
        result = await scrapeFacebook(url);
        break;
      default:
        return { views: null, error: `Unsupported platform: ${platform}` };
    }
    if (!result) {
      return { views: null, error: `${platform}: no data returned` };
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Scrape failed for ${platform}/${externalId}:`, msg);
    return { views: null, error: `${platform}: ${msg.slice(0, 200)}` };
  }
}

/**
 * YouTube: Use the Data API v3 for reliable view counts.
 */
async function scrapeYouTube(
  videoId: string
): Promise<{ views: number; title?: string } | null> {
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=statistics,snippet&key=${YT_API_KEY}`;

  const res = await fetch(apiUrl);
  if (!res.ok) {
    console.error('YouTube API error:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  return {
    views: parseInt(item.statistics.viewCount, 10) || 0,
    title: item.snippet?.title,
  };
}

/**
 * TikTok: Fetch page HTML and extract view count from embedded JSON.
 */
async function scrapeTikTok(
  url: string
): Promise<{ views: number; title?: string } | null> {
  try {
    // Try oEmbed first for title + possible play_count
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const oembedRes = await withRetry(() => fetch(oembedUrl, { signal: AbortSignal.timeout(10000) }));
    let title: string | undefined;
    let oembedViews: number | undefined;
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      title = oembedData.title;
      if (oembedData.play_count !== undefined) {
        oembedViews = oembedData.play_count;
      }
    }

    // If oEmbed gave us views, use that directly
    if (oembedViews !== undefined) {
      return { views: oembedViews, title };
    }

    // Fetch the page to get view count from embedded data
    const res = await withRetry(() => fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    }));

    if (!res.ok) return title ? { views: 0, title } : null;

    const html = await res.text();

    // Try to extract from __UNIVERSAL_DATA_FOR_REHYDRATION__
    const rehydrationMatch = html.match(/<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (rehydrationMatch) {
      try {
        const json = JSON.parse(rehydrationMatch[1]);
        const defaultScope = json.__DEFAULT_SCOPE__;
        const videoDetail = defaultScope?.['webapp.video-detail']?.itemInfo?.itemStruct;
        if (videoDetail?.stats?.playCount !== undefined) {
          return {
            views: videoDetail.stats.playCount,
            title: title || videoDetail.desc?.slice(0, 100),
          };
        }
      } catch { /* JSON parse failed, continue */ }
    }

    // Fallback: try SIGI_STATE (TikTok alternates between hydration scripts)
    const sigiMatch = html.match(/<script\s+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (sigiMatch) {
      try {
        const json = JSON.parse(sigiMatch[1]);
        const itemModule = json.ItemModule;
        if (itemModule) {
          const firstKey = Object.keys(itemModule)[0];
          const stats = itemModule[firstKey]?.stats;
          if (stats?.playCount !== undefined) {
            return {
              views: stats.playCount,
              title: title || itemModule[firstKey]?.desc?.slice(0, 100),
            };
          }
        }
      } catch { /* JSON parse failed, continue */ }
    }

    // Fallback: look for playCount in any JSON blob
    const playCountMatch = html.match(/"playCount"\s*:\s*(\d+)/);
    if (playCountMatch) {
      return { views: parseInt(playCountMatch[1], 10), title };
    }

    // Fallback: look for view count in meta tags
    const metaMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*?)"/);
    if (metaMatch) {
      const viewMatch = metaMatch[1].match(/([\d.]+[KMB]?)\s*(views|Likes)/i);
      if (viewMatch) {
        return { views: parseAbbreviatedNumber(viewMatch[1]), title };
      }
    }

    return title ? { views: 0, title } : null;
  } catch (err) {
    console.warn(`TikTok scrape failed for ${url}:`, (err as Error).message?.slice(0, 100));
    return null;
  }
}

/**
 * Extract the shortcode from an Instagram URL.
 * e.g. https://www.instagram.com/reel/ABC123/ → 'ABC123'
 */
function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/(?:\/p\/|\/reel\/|\/tv\/)([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Instagram: Use Graph API when OAuth token is provided, else fall back to HTML scraping.
 */
async function scrapeInstagram(
  url: string,
  oauthToken?: string,
  instagramUserId?: string
): Promise<{ views: number; title?: string } | null> {
  // Use Graph API when OAuth token + user ID are available
  if (oauthToken && instagramUserId) {
    try {
      const shortcode = extractInstagramShortcode(url);
      if (!shortcode) {
        console.warn(`Instagram: could not extract shortcode from ${url}`);
        // fall through to HTML scraping
      } else {
        // Fetch recent media to find matching shortcode
        const mediaParams = new URLSearchParams({
          fields: 'id,shortcode,media_type,video_views,timestamp',
          limit: '50',
          access_token: oauthToken,
        });
        const mediaRes = await fetch(
          `https://graph.instagram.com/${instagramUserId}/media?${mediaParams.toString()}`,
          { signal: AbortSignal.timeout(15000) }
        );

        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          const items: Array<{ id: string; shortcode: string; media_type: string; video_views?: number; timestamp: string }> =
            mediaData.data || [];

          const match = items.find((item) => item.shortcode === shortcode);
          if (match) {
            return { views: match.video_views || 0, title: undefined };
          }

          // Not found in recent 50 — try insights endpoint with media id search
          // We need to find the media id first via the shortcode
          // Try fetching by permalink lookup or insights on whatever we have
          // As a last resort, try the insights endpoint for the first matching media
          if (items.length > 0) {
            // Try to fetch insights for media by shortcode via a broader search
            // We'll try each item's insights to find one matching the shortcode indirectly
            // Since we can't search by shortcode, try fetching via the URL approach
            const insightsParams = new URLSearchParams({
              metric: 'plays',
              access_token: oauthToken,
            });

            // Look for a media ID that could correspond — use the first video we find as best effort
            // but only if we have a specific match; otherwise fall through
            console.warn(`Instagram: shortcode ${shortcode} not found in recent 50 media for user ${instagramUserId}`);
          }
        } else {
          console.warn('Instagram Graph API media fetch failed:', await mediaRes.text());
        }
      }
    } catch (err) {
      console.warn(`Instagram Graph API scrape failed for ${url}:`, (err as Error).message?.slice(0, 100));
    }
    // Fall through to HTML scraping as a fallback
  }

  // HTML scraping fallback
  try {
    // Try Instagram oEmbed first (more reliable for public posts)
    try {
      const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
      const oembedRes = await withRetry(() => fetch(oembedUrl, { signal: AbortSignal.timeout(10000) }));
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        const title = oembedData.title?.slice(0, 100);
        // oEmbed doesn't always return view counts, but check for it
        if (oembedData.view_count !== undefined) {
          return { views: oembedData.view_count, title };
        }
        // If we got a title from oEmbed, keep it for fallback
        if (title) {
          // Continue to HTML scraping but keep the title
          return await scrapeInstagramHtml(url, title);
        }
      }
    } catch { /* oEmbed failed, fall through to HTML */ }

    return await scrapeInstagramHtml(url);
  } catch (err) {
    console.warn(`Instagram scrape failed for ${url}:`, (err as Error).message?.slice(0, 100));
    return null;
  }
}

async function scrapeInstagramHtml(
  url: string,
  knownTitle?: string
): Promise<{ views: number; title?: string } | null> {
  const res = await withRetry(() => fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  }));

  if (!res.ok) return null;

  const html = await res.text();

  const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*?)"/);
  const title = knownTitle || titleMatch?.[1]?.slice(0, 100);

  // Look for view_count in embedded JSON
  const viewMatch = html.match(/"video_view_count"\s*:\s*(\d+)/);
  if (viewMatch) {
    return { views: parseInt(viewMatch[1], 10), title };
  }

  // Look for play_count
  const playMatch = html.match(/"play_count"\s*:\s*(\d+)/);
  if (playMatch) {
    return { views: parseInt(playMatch[1], 10), title };
  }

  // Fallback: description meta — only match views/plays, never likes
  const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*?)"/);
  if (descMatch) {
    const numMatch = descMatch[1].match(/([\d,]+)\s*(views|plays)/i);
    if (numMatch) {
      return { views: parseInt(numMatch[1].replace(/,/g, ''), 10), title };
    }
  }

  return title ? { views: 0, title } : null;
}

/**
 * Facebook: Try oEmbed, then page scraping.
 */
async function scrapeFacebook(
  url: string
): Promise<{ views: number; title?: string } | null> {
  try {
    // Try Facebook oEmbed API if app token is configured (free, most reliable)
    const fbToken = process.env.FACEBOOK_APP_TOKEN;
    if (fbToken) {
      try {
        const oembedUrl = `https://graph.facebook.com/v19.0/oembed_video?url=${encodeURIComponent(url)}&access_token=${fbToken}`;
        const oembedRes = await withRetry(() => fetch(oembedUrl, { signal: AbortSignal.timeout(10000) }));
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          const title = data.title?.slice(0, 100) || data.author_name;
          // oEmbed may not have view counts but the response is proof the video exists
          if (data.view_count !== undefined) {
            return { views: data.view_count, title };
          }
        }
      } catch { /* oEmbed failed, fall through to HTML */ }
    }

    // HTML scraping with redirect follow
    const res = await withRetry(() => fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    }));

    if (!res.ok) return null;

    const html = await res.text();

    // Extract title from og:title
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*?)"/);
    const title = titleMatch?.[1]?.slice(0, 100);

    // Look for view count in embedded data
    const viewMatch = html.match(/"video_view_count"\s*:\s*(\d+)/) ||
                      html.match(/"view_count"\s*:\s*(\d+)/) ||
                      html.match(/"viewCount"\s*:\s*"?(\d+)"?/);
    if (viewMatch) {
      return { views: parseInt(viewMatch[1], 10), title };
    }

    // Fallback: og:description might contain view info
    const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*?)"/);
    if (descMatch) {
      const numMatch = descMatch[1].match(/([\d,.]+)\s*(views|Aufrufe)/i);
      if (numMatch) {
        return { views: parseInt(numMatch[1].replace(/[,.]/g, ''), 10), title };
      }
    }

    return title ? { views: 0, title } : null;
  } catch (err) {
    console.warn(`Facebook scrape failed for ${url}:`, (err as Error).message?.slice(0, 100));
    return null;
  }
}

/**
 * Parse abbreviated numbers like "1.2M", "500K", "3B"
 */
function parseAbbreviatedNumber(str: string): number {
  const num = parseFloat(str.replace(/,/g, ''));
  if (str.endsWith('B') || str.endsWith('b')) return Math.round(num * 1_000_000_000);
  if (str.endsWith('M') || str.endsWith('m')) return Math.round(num * 1_000_000);
  if (str.endsWith('K') || str.endsWith('k')) return Math.round(num * 1_000);
  return Math.round(num);
}

/**
 * Batch scrape all videos. Returns stats.
 * oauthTokens: map of cutter_id → { token, userId } for Instagram Graph API access
 */
export async function scrapeAllCutterVideos(
  videos: Array<{ id: string; cutter_id?: string; platform: string; external_id: string; url: string }>,
  oauthTokens?: Map<string, { token: string; userId: string }>
): Promise<{ updated: number; failed: number; results: Array<{ id: string; views: number | null; title?: string; error?: string }> }> {
  let updated = 0;
  let failed = 0;
  const results: Array<{ id: string; views: number | null; title?: string; error?: string }> = [];

  for (const video of videos) {
    let oauthToken: string | undefined;
    let instagramUserId: string | undefined;

    if (video.platform === 'instagram' && oauthTokens && video.cutter_id) {
      const tokenEntry = oauthTokens.get(video.cutter_id);
      if (tokenEntry) {
        oauthToken = tokenEntry.token;
        instagramUserId = tokenEntry.userId;
      }
    }

    const result = await scrapeVideoViews(video.platform, video.external_id, video.url, oauthToken, instagramUserId);
    if (result.views !== null) {
      results.push({ id: video.id, views: result.views, title: result.title });
      updated++;
    } else {
      results.push({ id: video.id, views: null, error: result.error });
      failed++;
    }

    // Small delay between requests to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  return { updated, failed, results };
}
