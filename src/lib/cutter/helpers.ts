import type { DbClient } from '@/lib/db';
import { parseClipUrl } from '@/lib/ingest/parser';

export interface ParsedUrl {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
  externalId: string;
  accountHandle: string | null;
}

/**
 * Parse a social media video URL into platform, external ID, and account handle.
 * Delegates to the canonical ingest parser for consistent behavior.
 */
export function parsePlatformUrl(url: string): ParsedUrl | null {
  const result = parseClipUrl(url);
  if (!result.ok) return null;
  return {
    platform:      result.platform,
    externalId:    result.videoId,
    accountHandle: result.accountHandle,
  };
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
