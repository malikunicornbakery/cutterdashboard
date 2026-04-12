/**
 * GET /api/alerts
 * Returns ops_alerts for the authenticated cutter's own videos.
 * Cutters can only see alerts on their own clips — no cross-cutter data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db  = await ensureDb();
  const cid = auth.id;

  const url    = new URL(request.url);
  const status = url.searchParams.get('status') || 'open,acknowledged,in_review';
  const statusList = status.split(',').map((s) => s.trim()).filter(Boolean);

  const placeholders = statusList.map(() => '?').join(',');

  const [alertsResult, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT
              a.id, a.type, a.severity, a.status,
              a.title, a.detail, a.meta,
              a.triggered_at, a.updated_at,
              a.video_id,
              v.title   AS video_title,
              v.url     AS video_url,
              v.platform
            FROM ops_alerts a
            JOIN cutter_videos v ON v.id = a.video_id
            WHERE a.cutter_id = ?
              AND a.status IN (${placeholders})
            ORDER BY
              CASE a.severity
                WHEN 'critical' THEN 1
                WHEN 'high'     THEN 2
                WHEN 'medium'   THEN 3
                ELSE 4 END,
              a.triggered_at DESC
            LIMIT 100`,
      args: [cid, ...statusList],
    }),

    // Total counts per status for the header badges
    db.execute({
      sql: `SELECT status, COUNT(*) AS cnt
            FROM ops_alerts
            WHERE cutter_id = ?
              AND status IN ('open','acknowledged','in_review','resolved','dismissed')
            GROUP BY status`,
      args: [cid],
    }),
  ]);

  const alerts = alertsResult.rows.map((r) => {
    const row = r as Record<string, unknown>;
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(row.meta as string || '{}'); } catch {}
    return { ...row, meta };
  });

  const counts: Record<string, number> = {};
  for (const r of countResult.rows as Record<string, unknown>[]) {
    counts[r.status as string] = Number(r.cnt);
  }

  return NextResponse.json({ alerts, counts });
}
