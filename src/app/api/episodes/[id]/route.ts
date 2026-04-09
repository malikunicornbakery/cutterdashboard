import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  // Verify ownership
  const episodeResult = await db.execute({
    sql: `SELECT id FROM episodes WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });

  if (!episodeResult.rows[0]) {
    return NextResponse.json({ error: 'Episode nicht gefunden' }, { status: 404 });
  }

  const body = await request.json();
  const allowedFields = ['title', 'description', 'platform'];
  const updates: string[] = [];
  const values: (string | null)[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field] ?? null);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 });
  }

  values.push(id);
  await db.execute({
    sql: `UPDATE episodes SET ${updates.join(', ')} WHERE id = ?`,
    args: values,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  // Verify ownership
  const episodeResult = await db.execute({
    sql: `SELECT id FROM episodes WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });

  if (!episodeResult.rows[0]) {
    return NextResponse.json({ error: 'Episode nicht gefunden' }, { status: 404 });
  }

  // Unlink videos
  await db.execute({
    sql: `UPDATE cutter_videos SET episode_id = NULL WHERE episode_id = ?`,
    args: [id],
  });

  await db.execute({
    sql: `DELETE FROM episodes WHERE id = ?`,
    args: [id],
  });

  return NextResponse.json({ success: true });
}
