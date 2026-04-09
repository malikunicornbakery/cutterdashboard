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
    SELECT v.id, v.title, v.url, v.platform, v.proof_url, v.proof_uploaded_at, v.proof_status,
           v.claimed_views, v.current_views, v.discrepancy_status,
           c.name as cutter_name, c.id as cutter_id
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE v.proof_status = 'pending'
    ORDER BY v.proof_uploaded_at DESC
  `);

  return NextResponse.json({ proofs: result.rows });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOpsAccess(request);
  if (!isCutter(auth)) return auth;

  const { videoId, action, notes } = await request.json();

  if (!videoId || !['approve', 'reject'].includes(action)) {
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

  const proofStatus = action === 'approve' ? 'approved' : 'rejected';

  if (action === 'approve') {
    await db.execute({
      sql: `UPDATE cutter_videos SET proof_status = ?, proof_notes = ?, verification_status = 'manual_proof' WHERE id = ?`,
      args: [proofStatus, notes ?? null, videoId],
    });
  } else {
    await db.execute({
      sql: `UPDATE cutter_videos SET proof_status = ?, proof_notes = ? WHERE id = ?`,
      args: [proofStatus, notes ?? null, videoId],
    });
  }

  const newScore = await recalculateReliabilityScore(db, video.cutter_id);

  await writeAuditLog(db, {
    actorId: auth.id,
    actorName: auth.name,
    action: action === 'approve' ? 'proof_approve' : 'proof_reject',
    entityType: 'video',
    entityId: videoId,
    meta: { cutter_id: video.cutter_id, notes: notes ?? null },
  });

  return NextResponse.json({ success: true, newScore });
}
