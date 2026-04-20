import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { recalculateReliabilityScore } from '@/lib/reliability';
import { createOpsNotification } from '@/lib/notifications';
import { upsertAlert, resolveAlert } from '@/lib/ops-alerts';
import { randomUUID } from 'crypto';

type DbClient = Awaited<ReturnType<typeof ensureDb>>;

async function ensureProofFilesTable(db: DbClient) {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS cutter_proof_files (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      cutter_id TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });
}

// ── GET: list proof files for a video ────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });
  if (!videoResult.rows[0]) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  await ensureProofFilesTable(db);

  const filesResult = await db.execute({
    sql: `SELECT id, file_url, file_name, file_size, mime_type, uploaded_at
          FROM cutter_proof_files
          WHERE video_id = ? AND cutter_id = ?
          ORDER BY display_order ASC, uploaded_at ASC`,
    args: [videoId, auth.id],
  });

  const files = filesResult.rows.map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      id: r.id as string,
      file_url: r.file_url as string,
      file_name: r.file_name as string | null,
      file_size: r.file_size as number | null,
      mime_type: r.mime_type as string | null,
      uploaded_at: r.uploaded_at as string,
    };
  });

  return NextResponse.json({ files });
}

// ── POST: upload one proof file ──────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });
  const video = videoResult.rows[0] as unknown as {
    id: string; cutter_id: string; proof_status: string | null;
  } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json({ error: 'Beleg wurde bereits genehmigt' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const note = (formData.get('note') as string | null)?.trim() ?? null;

  if (!file) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'Datei darf maximal 20 MB groß sein' }, { status: 400 });
  }

  const fileType = file.type || 'image/jpeg';
  if (!fileType.startsWith('image/') && fileType !== 'application/pdf') {
    return NextResponse.json({ error: 'Nur Bilder oder PDF erlaubt' }, { status: 400 });
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
    'image/gif': 'gif', 'application/pdf': 'pdf',
  };
  const ext = extMap[fileType] ?? 'jpg';

  const fileId = randomUUID();
  const blob = await put(`proofs/${videoId}/${fileId}.${ext}`, file, {
    access: 'public',
    contentType: fileType,
  });

  await ensureProofFilesTable(db);

  // Count existing files for display_order
  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM cutter_proof_files WHERE video_id = ?`,
    args: [videoId],
  });
  const existingCount = Number((countResult.rows[0] as unknown as Record<string, unknown>)?.cnt ?? 0);

  await db.execute({
    sql: `INSERT INTO cutter_proof_files (id, video_id, cutter_id, file_url, file_name, file_size, mime_type, display_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [fileId, videoId, auth.id, blob.url, file.name || null, file.size, fileType, existingCount],
  });

  // Update cutter_videos: set proof_url to latest, always set status to proof_submitted
  await db.execute({
    sql: `UPDATE cutter_videos
          SET proof_url            = ?,
              proof_uploaded_at    = datetime('now'),
              proof_status         = 'proof_submitted',
              proof_cutter_note    = COALESCE(?, proof_cutter_note),
              proof_rejection_reason = NULL,
              proof_reviewer_id    = NULL,
              proof_reviewer_name  = NULL,
              proof_reviewed_at    = NULL
          WHERE id = ?`,
    args: [blob.url, note, videoId],
  });

  await recalculateReliabilityScore(db, auth.id);

  const videoMeta = await db.execute({
    sql: `SELECT title FROM cutter_videos WHERE id = ?`,
    args: [videoId],
  });
  const videoTitle = (videoMeta.rows[0] as Record<string, unknown>)?.title as string | null ?? null;

  await createOpsNotification(db, {
    type: 'proof_submitted',
    title: 'Neuer Beleg eingereicht',
    body: `${auth.name} hat einen Screenshot für "${videoTitle ?? 'Clip'}" hochgeladen.`,
    actionUrl: '/ops/verification',
    entityType: 'video',
    entityId: videoId,
    dedupWindowHours: 12,
  });

  await upsertAlert(db, { type: 'proof_submitted', videoId, cutterId: auth.id, cutterName: auth.name });
  await resolveAlert(db, 'proof_overdue', videoId);

  return NextResponse.json({ proof_url: blob.url, file_id: fileId });
}

// ── DELETE: remove one file (by ?fileId=) or all files ──────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const fileId = searchParams.get('fileId');

  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_url, proof_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });
  const video = videoResult.rows[0] as unknown as {
    id: string; cutter_id: string; proof_url: string | null; proof_status: string | null;
  } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json({ error: 'Genehmigter Beleg kann nicht entfernt werden' }, { status: 400 });
  }

  await ensureProofFilesTable(db);

  if (fileId) {
    // Delete one specific file
    const fileResult = await db.execute({
      sql: `SELECT id, file_url FROM cutter_proof_files WHERE id = ? AND video_id = ? AND cutter_id = ?`,
      args: [fileId, videoId, auth.id],
    });
    const fileRow = fileResult.rows[0] as unknown as { id: string; file_url: string } | undefined;
    if (!fileRow) {
      return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 });
    }
    try { await del(fileRow.file_url); } catch { /* ignore blob errors */ }
    await db.execute({ sql: `DELETE FROM cutter_proof_files WHERE id = ?`, args: [fileId] });

    // Determine next proof_url from remaining files
    const remainingResult = await db.execute({
      sql: `SELECT id, file_url FROM cutter_proof_files WHERE video_id = ?
            ORDER BY display_order ASC, uploaded_at ASC LIMIT 1`,
      args: [videoId],
    });
    const firstRemaining = remainingResult.rows[0] as unknown as { id: string; file_url: string } | undefined;

    if (firstRemaining) {
      await db.execute({
        sql: `UPDATE cutter_videos SET proof_url = ? WHERE id = ?`,
        args: [firstRemaining.file_url, videoId],
      });
    } else {
      // No files left — clear proof data entirely
      await db.execute({
        sql: `UPDATE cutter_videos
              SET proof_url = NULL, proof_uploaded_at = NULL,
                  proof_status = 'no_proof_needed', proof_cutter_note = NULL,
                  proof_rejection_reason = NULL
              WHERE id = ?`,
        args: [videoId],
      });
    }
  } else {
    // Delete ALL files for this video (legacy / remove all)
    const allFilesResult = await db.execute({
      sql: `SELECT file_url FROM cutter_proof_files WHERE video_id = ? AND cutter_id = ?`,
      args: [videoId, auth.id],
    });
    for (const row of allFilesResult.rows) {
      const r = row as unknown as { file_url: string };
      try { await del(r.file_url); } catch { /* ignore */ }
    }
    await db.execute({
      sql: `DELETE FROM cutter_proof_files WHERE video_id = ? AND cutter_id = ?`,
      args: [videoId, auth.id],
    });
    if (video.proof_url) {
      try { await del(video.proof_url); } catch { /* ignore */ }
    }
    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_url = NULL, proof_uploaded_at = NULL,
                proof_status = 'no_proof_needed', proof_cutter_note = NULL,
                proof_rejection_reason = NULL
            WHERE id = ?`,
      args: [videoId],
    });
  }

  return NextResponse.json({ success: true });
}
