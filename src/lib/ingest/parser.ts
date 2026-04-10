/**
 * Smart Link Ingestion Parser
 * ════════════════════════════
 * Parses social media clip URLs into structured, normalized identifiers.
 *
 * SUPPORTED PLATFORMS
 *   YouTube  — /shorts/ID, /watch?v=ID, youtu.be/ID
 *   TikTok   — /@handle/video/ID, vm.tiktok.com/CODE (short), tiktok.com/t/CODE (new short)
 *   Instagram — /reel/CODE, /p/CODE, /tv/CODE
 *   Facebook  — /reel/ID, /watch/?v=ID, fb.watch/CODE, /share/r/CODE, /videos/ID
 *
 * ERROR CODES
 *   EMPTY_URL            — nothing typed yet
 *   INVALID_URL          — can't parse as URL at all
 *   UNSUPPORTED_PLATFORM — recognised domain but not one of our 4 platforms
 *   WRONG_CONTENT_TYPE   — platform recognised but URL points to profile/page not a clip
 *   NO_VIDEO_ID          — platform matched, path pattern unrecognised
 *   SHORT_URL            — valid short URL, but video ID needs server-side redirect resolution
 *
 * DESIGN RULES
 *   · Strip tracking params before processing (igsh, fbclid, _t, _r, utm_*, etc.)
 *   · Always return a normalizedUrl with tracking params removed
 *   · Short URLs are ok: (isShortUrl = true), caller decides if they want to resolve
 *   · Never throw — always return ParseResult
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

export type ParseErrorCode =
  | 'EMPTY_URL'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'WRONG_CONTENT_TYPE'
  | 'NO_VIDEO_ID'
  | 'SHORT_URL';

export interface ParseSuccess {
  ok: true;
  platform: Platform;
  videoId: string;
  accountHandle: string | null;
  normalizedUrl: string;
  isShortUrl: boolean;    // true → ID is the redirect code, not the real video ID
  displayHint: string;    // e.g. "YouTube Short", "TikTok Video", "Instagram Reel"
}

export interface ParseError {
  ok: false;
  code: ParseErrorCode;
  messageDe: string;  // user-facing German message
  originalUrl: string;
}

export type ParseResult = ParseSuccess | ParseError;

// ── Tracking params to strip ──────────────────────────────────────────────────

const STRIP_PARAMS = new Set([
  'igsh', 'igshid', 'igv', '_r', '_t', '_d',
  'fbclid', 'fb_ref', 'fb_source',
  'feature', 'app', 'ref', 'referer', 'referrer',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  's', 'share_url', 'is_from_webapp', 'sender_device', 'web_id',
  'from_embed', 't',  // YouTube timestamp — doesn't affect identity
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toUrl(raw: string): URL | null {
  try {
    const s = raw.trim();
    return new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
}

function cleanUrl(u: URL): URL {
  const clean = new URL(u.toString());
  // Strip tracking query params
  STRIP_PARAMS.forEach(p => clean.searchParams.delete(p));
  // Remove trailing slash from pathname (keeps path canonical)
  if (clean.pathname.length > 1 && clean.pathname.endsWith('/')) {
    clean.pathname = clean.pathname.slice(0, -1);
  }
  // Always use www for main domains
  clean.hash = '';
  return clean;
}

function host(u: URL): string {
  return u.hostname.replace(/^www\./, '').replace(/^m\./, '');
}

function success(
  platform: Platform,
  videoId: string,
  accountHandle: string | null,
  normalizedUrl: string,
  displayHint: string,
  isShortUrl = false
): ParseSuccess {
  return { ok: true, platform, videoId, accountHandle, normalizedUrl, displayHint, isShortUrl };
}

function error(
  code: ParseErrorCode,
  messageDe: string,
  originalUrl: string
): ParseError {
  return { ok: false, code, messageDe, originalUrl };
}

// ── Platform parsers ──────────────────────────────────────────────────────────

function parseYouTube(u: URL, clean: URL, original: string): ParseResult {
  const h = host(u);

  // youtu.be/VIDEO_ID  (short URL — but ID is the real video ID, not a redirect code)
  if (h === 'youtu.be') {
    const videoId = clean.pathname.slice(1).split('/')[0];
    if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      const normalized = `https://www.youtube.com/shorts/${videoId}`;
      return success('youtube', videoId, null, normalized, 'YouTube Short');
    }
    return error('NO_VIDEO_ID', 'Kein Video erkannt — bitte den direkten Link zum Short einfügen', original);
  }

  // youtube.com/shorts/VIDEO_ID  ← the primary format we care about
  const shortsMatch = clean.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,20})/);
  if (shortsMatch) {
    const normalized = `https://www.youtube.com/shorts/${shortsMatch[1]}`;
    return success('youtube', shortsMatch[1], null, normalized, 'YouTube Short');
  }

  // youtube.com/watch?v=VIDEO_ID  (might be a long video, we accept anyway)
  const watchId = clean.searchParams.get('v');
  if (clean.pathname.startsWith('/watch') && watchId && /^[A-Za-z0-9_-]{6,20}$/.test(watchId)) {
    // Normalize to watch URL without extra params
    const normalized = `https://www.youtube.com/watch?v=${watchId}`;
    return success('youtube', watchId, null, normalized, 'YouTube Video');
  }

  // youtube.com/embed/VIDEO_ID
  const embedMatch = clean.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,20})/);
  if (embedMatch) {
    const normalized = `https://www.youtube.com/shorts/${embedMatch[1]}`;
    return success('youtube', embedMatch[1], null, normalized, 'YouTube Short');
  }

  // youtube.com/@channel or /channel/... → profile, not a clip
  if (clean.pathname.startsWith('/@') || clean.pathname.startsWith('/channel/') || clean.pathname.startsWith('/c/') || clean.pathname === '/') {
    return error('WRONG_CONTENT_TYPE', 'Das ist ein Kanal-Link, kein Video-Link. Bitte den direkten Link zum Short einfügen.', original);
  }

  return error('NO_VIDEO_ID', 'Kein YouTube Short erkannt — unterstützte Formate: youtube.com/shorts/ID, youtu.be/ID', original);
}

function parseTikTok(u: URL, clean: URL, h: string, original: string): ParseResult {
  // vm.tiktok.com/CODE — mobile short link (redirect code, not video ID)
  if (h === 'vm.tiktok.com') {
    const code = clean.pathname.slice(1).split('/')[0];
    if (code && /^[A-Za-z0-9]{5,20}$/.test(code)) {
      return success('tiktok', code, null, `https://vm.tiktok.com/${code}`, 'TikTok (Kurzlink)', true);
    }
    return error('NO_VIDEO_ID', 'TikTok-Kurzlink konnte nicht gelesen werden', original);
  }

  // tiktok.com/t/CODE — newer short format
  const shortT = clean.pathname.match(/^\/t\/([A-Za-z0-9]{5,20})/);
  if (shortT) {
    return success('tiktok', shortT[1], null, `https://www.tiktok.com/t/${shortT[1]}`, 'TikTok (Kurzlink)', true);
  }

  // tiktok.com/@handle/video/VIDEO_ID  ← canonical
  const videoMatch = clean.pathname.match(/\/@([^/]+)\/video\/(\d{10,25})/);
  if (videoMatch) {
    const normalized = `https://www.tiktok.com/@${videoMatch[1]}/video/${videoMatch[2]}`;
    return success('tiktok', videoMatch[2], videoMatch[1], normalized, 'TikTok Video');
  }

  // tiktok.com/@handle  → profile page
  if (clean.pathname.match(/^\/@[^/]+\/?$/)) {
    return error('WRONG_CONTENT_TYPE', 'Das ist ein TikTok-Profil-Link. Bitte den direkten Link zum Video einfügen.', original);
  }

  // tiktok.com/discover, /foryou, etc.
  if (!clean.pathname.startsWith('/@')) {
    return error('WRONG_CONTENT_TYPE', 'Kein TikTok-Video erkannt — bitte den direkten Link zum Video kopieren', original);
  }

  return error('NO_VIDEO_ID', 'TikTok-Video-ID nicht gefunden — Format: tiktok.com/@handle/video/ID', original);
}

function parseInstagram(u: URL, clean: URL, original: string): ParseResult {
  // instagram.com/reel/CODE or /p/CODE or /tv/CODE
  const mediaMatch = clean.pathname.match(/^\/(reel|p|tv)\/([A-Za-z0-9_-]{5,30})/);
  if (mediaMatch) {
    const normalized = `https://www.instagram.com/${mediaMatch[1]}/${mediaMatch[2]}/`;
    const hint = mediaMatch[1] === 'reel' ? 'Instagram Reel' : 'Instagram Post';
    return success('instagram', mediaMatch[2], null, normalized, hint);
  }

  // instagram.com/stories/handle/ID
  if (clean.pathname.startsWith('/stories/')) {
    return error('WRONG_CONTENT_TYPE', 'Instagram Stories werden nicht unterstützt — nur Reels und Posts', original);
  }

  // instagram.com/handle — profile
  if (clean.pathname.match(/^\/[A-Za-z0-9._]+\/?$/) && !clean.pathname.startsWith('/explore')) {
    return error('WRONG_CONTENT_TYPE', 'Das ist ein Instagram-Profil-Link. Bitte den direkten Link zum Reel einfügen.', original);
  }

  return error('NO_VIDEO_ID', 'Kein Instagram-Reel erkannt — Format: instagram.com/reel/CODE', original);
}

function parseFacebook(u: URL, clean: URL, h: string, original: string): ParseResult {
  // fb.watch/CODE — short URL, redirect needed
  if (h === 'fb.watch') {
    const code = clean.pathname.slice(1).split('/')[0];
    if (code && code.length >= 4) {
      return success('facebook', code, null, `https://fb.watch/${code}`, 'Facebook (Kurzlink)', true);
    }
    return error('NO_VIDEO_ID', 'fb.watch-Link konnte nicht gelesen werden', original);
  }

  // facebook.com/share/r/CODE (new share short link)
  const shareMatch = clean.pathname.match(/^\/share\/r\/([A-Za-z0-9_-]+)/);
  if (shareMatch) {
    return success('facebook', shareMatch[1], null, `https://www.facebook.com/share/r/${shareMatch[1]}`, 'Facebook Reel (Kurzlink)', true);
  }

  // facebook.com/reel/ID
  const reelMatch = clean.pathname.match(/^\/reel\/(\d{10,20})/);
  if (reelMatch) {
    const normalized = `https://www.facebook.com/reel/${reelMatch[1]}`;
    return success('facebook', reelMatch[1], null, normalized, 'Facebook Reel');
  }

  // facebook.com/watch/?v=ID
  const watchV = clean.searchParams.get('v');
  if (clean.pathname.startsWith('/watch') && watchV && /^\d{10,20}$/.test(watchV)) {
    const normalized = `https://www.facebook.com/watch/?v=${watchV}`;
    return success('facebook', watchV, null, normalized, 'Facebook Video');
  }

  // facebook.com/handle/videos/ID
  const videosMatch = clean.pathname.match(/\/videos\/(\d{10,20})/);
  if (videosMatch) {
    const normalized = `https://www.facebook.com${clean.pathname}`;
    return success('facebook', videosMatch[1], null, normalized, 'Facebook Video');
  }

  // Profile / page links
  if (clean.pathname === '/' || clean.pathname.match(/^\/[A-Za-z0-9.]+\/?$/) || clean.pathname.startsWith('/groups/')) {
    return error('WRONG_CONTENT_TYPE', 'Das ist ein Facebook-Profil- oder Seiten-Link, kein Video. Bitte den direkten Link zum Reel einfügen.', original);
  }

  return error('NO_VIDEO_ID', 'Kein Facebook-Reel erkannt — unterstützte Formate: facebook.com/reel/ID, fb.watch/CODE', original);
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function parseClipUrl(raw: string): ParseResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return error('EMPTY_URL', '', raw);
  }

  const u = toUrl(trimmed);
  if (!u) {
    return error('INVALID_URL', 'Ungültiges URL-Format — bitte einen vollständigen Link einfügen (https://...)', raw);
  }

  const h = host(u);
  const clean = cleanUrl(u);

  // Route to platform parsers
  if (h === 'youtube.com' || h === 'youtu.be') return parseYouTube(u, clean, trimmed);
  if (h === 'tiktok.com' || h === 'vm.tiktok.com' || h.endsWith('.tiktok.com')) return parseTikTok(u, clean, h, trimmed);
  if (h === 'instagram.com') return parseInstagram(u, clean, trimmed);
  if (h === 'facebook.com' || h === 'fb.watch' || h === 'm.facebook.com') return parseFacebook(u, clean, h, trimmed);

  // Known social domains that we intentionally don't support
  const knownUnsupported: Record<string, string> = {
    'twitter.com':   'Twitter/X wird nicht unterstützt',
    'x.com':         'Twitter/X wird nicht unterstützt',
    'snapchat.com':  'Snapchat wird nicht unterstützt',
    'twitch.tv':     'Twitch wird nicht unterstützt',
    'pinterest.com': 'Pinterest wird nicht unterstützt',
    'linkedin.com':  'LinkedIn wird nicht unterstützt',
    'vimeo.com':     'Vimeo wird nicht unterstützt',
  };
  if (knownUnsupported[h]) {
    return error('UNSUPPORTED_PLATFORM', `${knownUnsupported[h]} — erlaubt: TikTok, YouTube, Instagram, Facebook`, trimmed);
  }

  return error(
    'UNSUPPORTED_PLATFORM',
    `"${h}" wird nicht unterstützt — erlaubt: TikTok, YouTube Shorts, Instagram Reels, Facebook Reels`,
    trimmed
  );
}

// ── Batch parse ───────────────────────────────────────────────────────────────

export interface BatchParseResult {
  results: Array<{ raw: string; result: ParseResult }>;
  validCount: number;
  errorCount: number;
}

export function parseClipUrls(rawLines: string): BatchParseResult {
  const lines = rawLines
    .split(/[\n,]+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const results = lines.map(raw => ({ raw, result: parseClipUrl(raw) }));
  const validCount = results.filter(r => r.result.ok).length;
  const errorCount = results.filter(r => !r.result.ok && (r.result as ParseError).code !== 'EMPTY_URL').length;

  return { results, validCount, errorCount };
}
