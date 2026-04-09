/**
 * YouTube Data API v3 adapter
 *
 * Requires env var: YOUTUBE_API_KEY
 * Get one free at: https://console.cloud.google.com → Enable "YouTube Data API v3"
 *
 * Quota: 10,000 units/day (free). Each video fetch = ~3 units. Plenty for daily sync.
 */

import type { VideoData } from './types';

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE = 'https://www.googleapis.com/youtube/v3';

// Resolve a channel handle (@name or channel URL) to a YouTube channel ID
// and uploads playlist ID
export async function resolveYouTubeChannel(
  handleOrUrl: string
): Promise<{ channelId: string; uploadsPlaylistId: string; title: string } | null> {
  if (!API_KEY) throw new Error('YOUTUBE_API_KEY not configured');

  // Extract handle from URL if needed
  let handle = handleOrUrl.trim();
  const urlMatch = handle.match(/youtube\.com\/@([^/?&]+)/);
  if (urlMatch) handle = `@${urlMatch[1]}`;
  const channelMatch = handle.match(/youtube\.com\/channel\/([^/?&]+)/);
  if (channelMatch) {
    // Already have channel ID
    const channelId = channelMatch[1];
    const res = await fetch(
      `${BASE}/channels?part=snippet,contentDetails&id=${channelId}&key=${API_KEY}`
    );
    const data = await res.json();
    const ch = data.items?.[0];
    if (!ch) return null;
    return {
      channelId,
      uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
      title: ch.snippet.title,
    };
  }

  // Handle-based lookup
  if (!handle.startsWith('@')) handle = `@${handle}`;
  const res = await fetch(
    `${BASE}/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${API_KEY}`
  );
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) return null;

  return {
    channelId: ch.id,
    uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
    title: ch.snippet.title,
  };
}

// Fetch all videos from a channel's uploads playlist (last 50 videos)
export async function fetchYouTubeVideos(
  uploadsPlaylistId: string
): Promise<VideoData[]> {
  if (!API_KEY) throw new Error('YOUTUBE_API_KEY not configured');

  // Step 1: Get video IDs from playlist
  const playlistRes = await fetch(
    `${BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${API_KEY}`
  );
  const playlistData = await playlistRes.json();

  if (!playlistData.items?.length) return [];

  const videoIds: string[] = playlistData.items.map(
    (item: { contentDetails: { videoId: string } }) => item.contentDetails.videoId
  );

  // Step 2: Batch fetch statistics (up to 50 IDs per request)
  const statsRes = await fetch(
    `${BASE}/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${API_KEY}`
  );
  const statsData = await statsRes.json();

  if (!statsData.items?.length) return [];

  return statsData.items.map((item: {
    id: string;
    snippet: { title: string; publishedAt: string };
    statistics: { viewCount?: string };
  }) => ({
    externalId: item.id,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    title: item.snippet.title,
    viewCount: parseInt(item.statistics.viewCount ?? '0', 10),
    publishedAt: item.snippet.publishedAt,
    platform: 'youtube' as const,
  }));
}
