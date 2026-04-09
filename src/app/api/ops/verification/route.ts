import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAccess, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { recalculateReliabilityScore } from '@/lib/reliability';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const auth = await requireOpsAccess(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  const result = await db.execute(`
    SELECT
      v.id, v.title, v.url, v.platform,
      v.proof_url, v.proof_uploaded_at, v.proof_status,
      v.proof_cutter_note, v.proof_rejection_reason,
      v.claimed_views, v.current_views, v.observed_views, v.api_views,
      v.verification_source, v.confidence_level,
      v.discrepancy_status, v.discrepancy_percent,
      c.name as cutter_name, c.id as cutter_id
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE v.proof_status = 'proof_submitted'
    ORDER BY v.proof_uploaded_at DESC
  `);

  return NextResponse.json({ proofs: result.rows });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOpsAccess(request);
  if (!isCutter(auth)) return auth;

  const { videoId, action, notes, rejectionReason } = await request.json();

  if (!videoId || !['approve', 'reject', 'request_proof'].includes(action)) {
    return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  }

  const db = await ensureDb();

  // Get video to find cutter_id
  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id FROM cutter_videos WHERE id = ?`,
    args: [videoId],
  });

  const video = videoResult.rows[0] as unknown as { id: string; cutter_id: string } | undefined;
  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_status = 'proof_approved',
                proof_reviewer_id = ?,
                proof_reviewer_name = ?,
                proof_reviewed_at = ?,
                review_notes = ?,
                verification_status = 'manual_proof'
            WHERE id = ?`,
      args: [auth.id, auth.name, now, notes ?? null, videoId],
    });

    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'proof_approve',
      entityType: 'video',
      entityId: videoId,
      meta: { cutter_id: video.cutter_id, notes: notes ?? null },
    });

  } else if (action === 'reject') {
    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_status = 'proof_rejected',
                proof_reviewer_id = ?,
                proof_reviewer_name = ?,
                proof_reviewed_at = ?,
                proof_rejection_reason = ?,
                review_notes = ?
            WHERE id = ?`,
      args: [auth.id, auth.name, now, rejectionReason ?? null, notes ?? null, videoId],
    });

    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'proof_reject',
      entityType: 'video',
      entityId: videoId,
      meta: { cutter_id: video.cutter_id, reason: rejectionReason ?? null, notes: notes ?? null },
    });

  } else if (action === 'request_proof') {
    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_status = 'proof_requested',
                proof_requested_by = ?,
                proof_requested_at = ?,
                review_notes = ?
            WHERE id = ?`,
      args: [auth.name, now, notes ?? null, videoId],
    });

    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'proof_request',
      entityType: 'video',
      entityId: videoId,
      meta: { cutter_id: video.cutter_id, notes: notes ?? null },
    });
  }

  const newScore = await recalculateReliabilityScore(db, video.cutter_id);

  return NextResponse.json({ success: true, newScore });
}
