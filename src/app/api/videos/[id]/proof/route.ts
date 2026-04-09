import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { recalculateReliabilityScore } from '@/lib/reliability';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  // Verify video belongs to auth user
  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });

  if (!videoResult.rows[0]) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
  }

  // Validate type and size
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Nur JPEG, PNG oder WebP erlaubt' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Datei darf maximal 10 MB groß sein' }, { status: 400 });
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = extMap[file.type];

  const blob = await put(`proofs/${videoId}/${Date.now()}.${ext}`, file, { access: 'public' });

  await db.execute({
    sql: `UPDATE cutter_videos SET proof_url = ?, proof_uploaded_at = datetime('now'), proof_status = 'pending' WHERE id = ?`,
    args: [blob.url, videoId],
  });

  await recalculateReliabilityScore(db, auth.id);

  return NextResponse.json({ proof_url: blob.url });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  // Verify video belongs to auth user
  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_url FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });

  const video = videoResult.rows[0] as unknown as { id: string; cutter_id: string; proof_url: string | null } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  if (video.proof_url) {
    try {
      await del(video.proof_url);
    } catch {
      // Ignore blob deletion errors
    }
  }

  await db.execute({
    sql: `UPDATE cutter_videos SET proof_url = NULL, proof_uploaded_at = NULL, proof_status = 'none' WHERE id = ?`,
    args: [videoId],
  });

  return NextResponse.json({ success: true });
}
