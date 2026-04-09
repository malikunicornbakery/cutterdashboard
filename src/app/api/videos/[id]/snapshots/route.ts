import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  // Verify video belongs to this cutter
  const videoResult = await db.execute({
    sql: `SELECT id FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });
  if (videoResult.rows.length === 0) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
  const limitDays = Math.min(Math.max(days, 1), 365);

  const snapshots = await db.execute({
    sql: `SELECT views, success, error_message, scraped_at
          FROM cutter_view_snapshots
          WHERE video_id = ? AND scraped_at >= datetime('now', ?)
          ORDER BY scraped_at DESC`,
    args: [id, `-${limitDays} days`],
  });

  return NextResponse.json({ snapshots: snapshots.rows });
}
