/**
 * Vercel Cron Job — täglich 04:00 Uhr UTC
 *
 * Zieht automatisch Views von allen verbundenen Klipper-Accounts.
 * Gesichert mit CRON_SECRET (Vercel setzt diesen Header automatisch).
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSync, startSyncLog, writeSyncLog } from '@/lib/sync/engine';

export const maxDuration = 300; // 5 Minuten max (Vercel Pro)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Sicherheitscheck — nur Vercel Cron oder Admin mit Secret darf triggern
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    await startSyncLog();
    const results = await runSync();
    const totalMs = Date.now() - start;
    await writeSyncLog(results, totalMs);

    const summary = {
      success: true,
      durationMs: totalMs,
      accounts: results.length,
      videosFound: results.reduce((s, r) => s + r.videosFound, 0),
      videosCreated: results.reduce((s, r) => s + r.videosCreated, 0),
      videosUpdated: results.reduce((s, r) => s + r.videosUpdated, 0),
      errors: results.filter((r) => r.error).length,
      results,
    };

    console.log('[CRON] Sync complete:', JSON.stringify(summary, null, 2));
    return NextResponse.json(summary);

  } catch (error) {
    console.error('[CRON] Sync failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
