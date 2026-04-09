import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { calculateDiscrepancy, type VerificationStatus } from '@/lib/verification/discrepancy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  // Only allow deleting own videos
  const videoResult = await db.execute({
    sql: `SELECT id FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });

  if (!videoResult.rows[0]) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Don't allow deleting videos that have been invoiced
  const invoicedResult = await db.execute({
    sql: `SELECT id FROM cutter_invoice_items WHERE video_id = ? LIMIT 1`,
    args: [id],
  });

  if (invoicedResult.rows[0]) {
    return NextResponse.json(
      { error: 'Video kann nicht gelöscht werden — bereits in einer Rechnung enthalten' },
      { status: 400 }
    );
  }

  await db.execute({ sql: `DELETE FROM cutter_videos WHERE id = ?`, args: [id] });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const body = await request.json();
  const { claimed_views, episode_id } = body;

  if (claimed_views !== undefined && claimed_views !== null && (typeof claimed_views !== 'number' || claimed_views < 0)) {
    return NextResponse.json({ error: 'Ungültiger Wert für claimed_views' }, { status: 400 });
  }

  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id, platform, current_views, verification_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });
  const video = videoResult.rows[0] as unknown as {
    id: string; platform: string; current_views: number; verification_status: string;
  } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Handle episode_id update only (no claimed_views change)
  if (episode_id !== undefined && claimed_views === undefined) {
    await db.execute({
      sql: `UPDATE cutter_videos SET episode_id = ? WHERE id = ?`,
      args: [episode_id ?? null, id],
    });
    return NextResponse.json({ success: true });
  }

  // Recalculate discrepancy with new claim
  const verificationStatus = video.verification_status as VerificationStatus;
  const { status: discrepancyStatus, percent: discrepancyPercent } = calculateDiscrepancy(
    video.current_views,
    claimed_views ?? null,
    verificationStatus
  );

  const setClauses = [
    'claimed_views = ?',
    'discrepancy_status = ?',
    'discrepancy_percent = ?',
  ];
  const args: (string | number | null)[] = [
    claimed_views ?? null,
    discrepancyStatus !== 'cannot_verify' ? discrepancyStatus : null,
    discrepancyPercent,
  ];

  if (episode_id !== undefined) {
    setClauses.push('episode_id = ?');
    args.push(episode_id ?? null);
  }

  args.push(id);

  await db.execute({
    sql: `UPDATE cutter_videos SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  return NextResponse.json({ success: true, discrepancy_status: discrepancyStatus, discrepancy_percent: discrepancyPercent });
}
