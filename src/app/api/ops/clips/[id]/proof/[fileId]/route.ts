import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { randomUUID } from 'crypto';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: args.map(a =>
              a === null ? { type: 'null' }
              : typeof a === 'number' ? { type: 'integer', value: String(Math.round(a)) }
              : { type: 'text', value: String(a) }
            ),
          },
        },
        { type: 'close' },
      ],
    }),
  });
  const data   = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result ?? { rows: [], cols: [] };
}

/**
 * PATCH /api/ops/clips/[id]/proof/[fileId]
 * Body: { action: 'approve' | 'reject' | 'reset', review_note?: string }
 *
 * Approves or rejects an individual proof file.
 * Also updates the parent video's proof_status as an aggregate.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  const { id: videoId, fileId } = await params;
  const body        = await request.json();
  const { action, review_note } = body as { action: 'approve' | 'reject' | 'reset'; review_note?: string };

  if (!['approve', 'reject', 'reset'].includes(action)) {
    return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });
  }

  // Verify file belongs to this clip
  const fileCheck = await dbQuery(
    `SELECT id, video_id FROM cutter_proof_files WHERE id = ? AND video_id = ?`,
    [fileId, videoId]
  );
  if (!(fileCheck.rows as unknown[]).length) {
    return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Map action → proof_status
  const statusMap: Record<string, string> = {
    approve: 'approved',
    reject:  'rejected',
    reset:   'uploaded',
  };
  const newStatus = statusMap[action];

  // Update the individual proof file
  if (action === 'approve' || action === 'reject') {
    await dbQuery(
      `UPDATE cutter_proof_files
       SET proof_status     = ?,
           reviewed_by_id   = ?,
           reviewed_by_name = ?,
           reviewed_at      = ?,
           review_note      = ?,
           updated_at       = ?
       WHERE id = ?`,
      [newStatus, auth.id, auth.name, now, review_note ?? null, now, fileId]
    );
  } else {
    // reset
    await dbQuery(
      `UPDATE cutter_proof_files
       SET proof_status    = 'uploaded',
           reviewed_by_id  = NULL,
           reviewed_by_name = NULL,
           reviewed_at     = NULL,
           review_note     = NULL,
           updated_at      = ?
       WHERE id = ?`,
      [now, fileId]
    );
  }

  // Recalculate aggregate video-level proof_status
  // Rules:
  //   - any file approved → video proof_status = proof_approved
  //   - any file rejected (and none approved) → video proof_status = proof_rejected
  //   - all reset/uploaded → video proof_status = proof_submitted (back to review queue)
  const allFilesResult = await dbQuery(
    `SELECT proof_status FROM cutter_proof_files WHERE video_id = ?`,
    [videoId]
  );
  const statuses = (allFilesResult.rows as unknown[]).map((r) => {
    const row = r as { value?: string }[];
    // Turso raw format: row is array of { type, value }
    return (row[0] as unknown as { value: string })?.value ?? 'uploaded';
  });

  let aggregateStatus = 'proof_submitted';
  if (statuses.some(s => s === 'approved')) aggregateStatus = 'proof_approved';
  else if (statuses.some(s => s === 'rejected')) aggregateStatus = 'proof_rejected';

  if (action === 'approve') {
    await dbQuery(
      `UPDATE cutter_videos
       SET proof_status        = 'proof_approved',
           proof_reviewer_id   = ?,
           proof_reviewer_name = ?,
           proof_reviewed_at   = ?,
           verification_status = 'manual_proof'
       WHERE id = ?`,
      [auth.id, auth.name, now, videoId]
    );
  } else if (action === 'reject') {
    await dbQuery(
      `UPDATE cutter_videos
       SET proof_status           = ?,
           proof_rejection_reason = ?,
           proof_reviewer_id      = ?,
           proof_reviewer_name    = ?,
           proof_reviewed_at      = ?
       WHERE id = ?`,
      [aggregateStatus, review_note ?? null, auth.id, auth.name, now, videoId]
    );
  }

  // Audit log
  await dbQuery(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, ?, 'video', ?, ?, ?)`,
    [
      randomUUID(), auth.id, auth.name,
      `video.proof_file_${action}`,
      videoId,
      JSON.stringify({ file_id: fileId, review_note: review_note ?? null }),
      now,
    ]
  );

  return NextResponse.json({ success: true, proof_status: newStatus });
}
