/**
 * TikTok adapter — VORBEREITET für Business API
 *
 * Phase 1 (jetzt): Klipper gibt uns sein TikTok-Handle → wir speichern es.
 *                  Kein automatischer Sync möglich ohne Business API.
 *
 * Phase 2 (sobald Klipper Business Account hat):
 *   - TikTok Business API: https://business.tiktok.com/portal/docs
 *   - Access Token via OAuth 2.0 (in cutter_accounts.oauth_access_token)
 *   - Dann wird fetchTikTokVideos() hier implementiert
 *
 * Setup für Phase 2:
 *   1. TikTok Developer Account: https://developers.tiktok.com
 *   2. App erstellen → "Video Management" Permission beantragen
 *   3. OAuth Flow implementieren (ähnlich wie Instagram in /api/auth/instagram)
 *   4. Access Token in cutter_accounts speichern
 */

import type { VideoData } from './types';

export async function fetchTikTokVideos(
  _accessToken: string,
  _handle: string
): Promise<VideoData[]> {
  // TODO: Implement TikTok Business API v2
  // POST https://business-api.tiktok.com/open_api/v1.3/video/list/
  // Headers: { Access-Token: accessToken }
  // Body: { fields: ["video_id","title","cover_url","share_url","view_count","create_time"] }

  console.log('[TikTok] Business API not yet configured. Skipping sync.');
  return [];
}

export function isTikTokReady(accessToken: string | null): boolean {
  return !!accessToken;
}
