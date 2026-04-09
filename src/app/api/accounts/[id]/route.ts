import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  const accountResult = await db.execute({
    sql: `SELECT id FROM cutter_accounts WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });

  if (!accountResult.rows[0]) {
    return NextResponse.json({ error: 'Konto nicht gefunden' }, { status: 404 });
  }

  await db.execute({ sql: `DELETE FROM cutter_accounts WHERE id = ?`, args: [id] });
  return NextResponse.json({ success: true });
}
