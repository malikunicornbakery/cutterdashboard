import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { recalculateReliabilityScore } from '@/lib/reliability';
import { createOpsNotification } from '@/lib/notifications';
import { upsertAlert, resolveAlert } from '@/lib/ops-alerts';
import { randomUUID } from 'crypto';

type DbClient = Awaited<ReturnType<typeof ensureDb>>;

// ── Schema migration (idempotent) ────────────────────────────────
async function ensureProofFilesTable(db: DbClient) {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS cutter_proof_files (
      id            TEXT PRIMARY KEY,
      video_id      TEXT NOT NULL,
      cutter_id     TEXT NOT NULL,
      file_url      TEXT NOT NULL,
      file_name     TEXT,
      file_size     INTEGER,
      mime_type     TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      proof_status  TEXT NOT NULL DEFAULT 'uploaded',
      uploader_note TEXT,
      reviewed_by_id   TEXT,
      reviewed_by_name TEXT,
      reviewed_at   TEXT,
      review_note   TEXT,
      uploaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });

  const migrations = [
    `ALTER TABLE cutter_proof_files ADD COLUMN proof_status  TEXT NOT NULL DEFAULT 'uploaded'`,
    `ALTER TABLE cutter_proof_files ADD COLUMN uploader_note TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN reviewed_by_id   TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN reviewed_by_name TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN reviewed_at   TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN review_note   TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN updated_at    TEXT DEFAULT (datetime('now'))`,
  ];
  for (const sql of migrations) {
    try { await db.execute({ sql, args: [] }); } catch { /* column already exists */ }
  }
}

// ── GET: return the single active proof for this clip (or null) ──
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

  const fileResult = await db.execute({
    sql: `SELECT id, file_url, file_name, file_size, mime_type, uploaded_at,
                 proof_status, uploader_note, reviewed_by_name, reviewed_at, review_note
          FROM cutter_proof_files
          WHERE video_id = ? AND cutter_id = ?
          ORDER BY uploaded_at DESC LIMIT 1`,
    args: [videoId, auth.id],
  });

  if (!fileResult.rows[0]) {
    return NextResponse.json({ proof: null });
  }

  const r = fileResult.rows[0] as unknown as Record<string, unknown>;
  const proof = {
    id:               r.id              as string,
    file_url:         r.file_url        as string,
    file_name:        r.file_name       as string | null,
    file_size:        r.file_size       as number | null,
    mime_type:        r.mime_type       as string | null,
    uploaded_at:      r.uploaded_at     as string,
    proof_status:     r.proof_status    as string | null,
    uploader_note:    r.uploader_note   as string | null,
    reviewed_by_name: r.reviewed_by_name as string | null,
    reviewed_at:      r.reviewed_at     as string | null,
    review_note:      r.review_note     as string | null,
  };

  return NextResponse.json({ proof });
}

// ── POST: upload the one proof for this clip ─────────────────────
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

  if (!video) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json({ error: 'Beleg wurde bereits genehmigt und kann nicht ersetzt werden' }, { status: 400 });
  }

  await ensureProofFilesTable(db);

  // ── Enforce one-proof rule ──────────────────────────────────────
  const existingResult = await db.execute({
    sql: `SELECT id FROM cutter_proof_files WHERE video_id = ?`,
    args: [videoId],
  });
  if (existingResult.rows.length > 0) {
    return NextResponse.json(
      { error: 'Für diesen Clip existiert bereits ein Nachweis. Bitte zuerst den vorhandenen Nachweis löschen.' },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file     = formData.get('file') as File | null;
  const note     = (formData.get('note') as string | null)?.trim() ?? null;

  if (!file) return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'Datei darf maximal 20 MB groß sein' }, { status: 400 });
  }

  const fileType = file.type || 'image/jpeg';
  if (!fileType.startsWith('image/') && fileType !== 'application/pdf') {
    return NextResponse.json({ error: 'Nur Bilder (JPEG, PNG, WebP, HEIC) oder PDF erlaubt' }, { status: 400 });
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
    'image/gif': 'gif', 'application/pdf': 'pdf',
  };
  const ext    = extMap[fileType] ?? 'jpg';
  const fileId = randomUUID();
  const blob   = await put(`proofs/${videoId}/${fileId}.${ext}`, file, {
    access: 'public', contentType: fileType,
  });

  await db.execute({
    sql: `INSERT INTO cutter_proof_files
            (id, video_id, cutter_id, file_url, file_name, file_size, mime_type,
             display_order, proof_status, uploader_note)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'uploaded', ?)`,
    args: [fileId, videoId, auth.id, blob.url, file.name || null, file.size, fileType, note],
  });

  // Update cutter_videos proof fields
  await db.execute({
    sql: `UPDATE cutter_videos
          SET proof_url              = ?,
              proof_uploaded_at      = datetime('now'),
              proof_status           = 'proof_submitted',
              proof_cutter_note      = COALESCE(?, proof_cutter_note),
              proof_rejection_reason = NULL,
              proof_reviewer_id      = NULL,
              proof_reviewer_name    = NULL,
              proof_reviewed_at      = NULL
          WHERE id = ?`,
    args: [blob.url, note, videoId],
  });

  await recalculateReliabilityScore(db, auth.id);

  const videoMeta = await db.execute({ sql: `SELECT title FROM cutter_videos WHERE id = ?`, args: [videoId] });
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

// ── DELETE: remove the proof for this clip ───────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_url, proof_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });
  const video = videoResult.rows[0] as unknown as {
    id: string; cutter_id: string; proof_url: string | null; proof_status: string | null;
  } | undefined;

  if (!video) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json({ error: 'Genehmigter Beleg kann nicht entfernt werden' }, { status: 400 });
  }

  await ensureProofFilesTable(db);

  // Delete the one proof file record for this video
  const fileResult = await db.execute({
    sql: `SELECT id, file_url FROM cutter_proof_files WHERE video_id = ? AND cutter_id = ? LIMIT 1`,
    args: [videoId, auth.id],
  });
  const fileRow = fileResult.rows[0] as unknown as { id: string; file_url: string } | undefined;

  if (fileRow) {
    try { await del(fileRow.file_url); } catch { /* ignore blob errors */ }
    await db.execute({ sql: `DELETE FROM cutter_proof_files WHERE id = ?`, args: [fileRow.id] });
  }

  // Clear proof fields on cutter_videos
  await db.execute({
    sql: `UPDATE cutter_videos
          SET proof_url              = NULL,
              proof_uploaded_at      = NULL,
              proof_status           = 'no_proof_needed',
              proof_cutter_note      = NULL,
              proof_rejection_reason = NULL
          WHERE id = ?`,
    args: [videoId],
  });

  return NextResponse.json({ success: true });
}
