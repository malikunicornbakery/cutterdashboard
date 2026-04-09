import type { DbClient } from '@/lib/db';

export interface ParsedUrl {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
  externalId: string;
  accountHandle: string | null;
}

/**
 * Parse a social media video URL into platform, external ID, and account handle.
 */
export function parsePlatformUrl(url: string): ParsedUrl | null {
  try {
    // Normalize: remove tracking params, trim whitespace
    const cleaned = url.trim();
    const u = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');

    // YouTube: youtube.com/watch?v=X, youtu.be/X, youtube.com/shorts/X
    if (host === 'youtube.com' || host === 'youtu.be') {
      let videoId: string | null = null;

      if (host === 'youtu.be') {
        videoId = u.pathname.slice(1).split('/')[0];
      } else if (u.pathname.startsWith('/watch')) {
        videoId = u.searchParams.get('v');
      } else if (u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.split('/shorts/')[1]?.split('/')[0];
      }

      if (videoId) {
        return { platform: 'youtube', externalId: videoId, accountHandle: null };
      }
    }

    // TikTok: tiktok.com/@handle/video/ID
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      const match = u.pathname.match(/@([^/]+)\/video\/(\d+)/);
      if (match) {
        return {
          platform: 'tiktok',
          externalId: match[2],
          accountHandle: match[1],
        };
      }
      // Short URL: vm.tiktok.com/XXX — can't extract ID without following redirect
      // Try tiktok.com/t/XXX format
      const shortMatch = u.pathname.match(/\/(?:t\/)?(\w+)/);
      if (host === 'vm.tiktok.com' && shortMatch) {
        return {
          platform: 'tiktok',
          externalId: shortMatch[1],
          accountHandle: null,
        };
      }
    }

    // Instagram: instagram.com/reel/CODE/, instagram.com/p/CODE/
    if (host === 'instagram.com') {
      const match = u.pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
      if (match) {
        return {
          platform: 'instagram',
          externalId: match[2],
          accountHandle: null,
        };
      }
    }

    // Facebook: facebook.com/reel/ID, facebook.com/watch/?v=ID, fb.watch/X
    if (host === 'facebook.com' || host === 'fb.watch') {
      if (host === 'fb.watch') {
        const fbId = u.pathname.slice(1).split('/')[0];
        if (fbId) {
          return { platform: 'facebook', externalId: fbId, accountHandle: null };
        }
      }

      // facebook.com/share/r/CODE (share short-link)
      const shareMatch = u.pathname.match(/\/share\/r\/([A-Za-z0-9_-]+)/);
      if (shareMatch) {
        return { platform: 'facebook', externalId: shareMatch[1], accountHandle: null };
      }

      const reelMatch = u.pathname.match(/\/reel\/(\d+)/);
      if (reelMatch) {
        return { platform: 'facebook', externalId: reelMatch[1], accountHandle: null };
      }

      const watchV = u.searchParams.get('v');
      if (u.pathname.startsWith('/watch') && watchV) {
        return { platform: 'facebook', externalId: watchV, accountHandle: null };
      }

      // facebook.com/username/videos/ID
      const videoMatch = u.pathname.match(/\/videos\/(\d+)/);
      if (videoMatch) {
        return { platform: 'facebook', externalId: videoMatch[1], accountHandle: null };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Generate the next sequential invoice number in format RE-YYYY-NNN.
 */
export async function generateInvoiceNumber(db: DbClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RE-${year}-`;

  const result = await db.execute({
    sql: `SELECT invoice_number FROM cutter_invoices
       WHERE invoice_number LIKE ? || '%'
       ORDER BY invoice_number DESC LIMIT 1`,
    args: [prefix],
  });
  const last = result.rows[0] as { invoice_number: string } | undefined;

  let counter = 1;
  if (last) {
    const num = parseInt(last.invoice_number.replace(prefix, ''), 10);
    if (!isNaN(num)) counter = num + 1;
  }

  return `${prefix}${String(counter).padStart(3, '0')}`;
}

/**
 * Format a number as EUR currency (German locale).
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Format a number with German locale (dot thousands separator).
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n);
}
