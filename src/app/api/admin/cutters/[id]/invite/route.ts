/**
 * POST /api/admin/cutters/[id]/invite
 * Re-sends an invite email to the cutter. Generates a fresh 7-day token.
 * Use when the original invite has expired or the cutter didn't receive it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { sendInviteEmail } from '@/lib/cutter/email';

const INVITE_EXPIRES_DAYS = 7;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'USER_MANAGE');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT id, name, email FROM cutters WHERE id = ?`,
    args: [id],
  });
  const cutter = result.rows[0] as { id: string; name: string; email: string } | undefined;

  if (!cutter) {
    return NextResponse.json({ error: 'Cutter nicht gefunden' }, { status: 404 });
  }

  // Generate fresh invite token
  const token   = randomUUID();
  const expires = new Date(Date.now() + INVITE_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `UPDATE cutters SET magic_token = ?, token_expires_at = ? WHERE id = ?`,
    args: [token, expires, id],
  });

  await sendInviteEmail(cutter.email, cutter.name, token, auth.name);

  return NextResponse.json({ success: true, email: cutter.email });
}
