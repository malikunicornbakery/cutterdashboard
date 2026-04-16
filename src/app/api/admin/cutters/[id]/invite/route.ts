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
  const [auth, { id }] = await Promise.all([
    requirePermission(request, 'USER_MANAGE'),
    params,
  ]);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT id, name, email FROM cutters WHERE id = ?`,
    args: [id],
  });
  const cutter = result.rows[0] as { id: string; name: string; email: string } | undefined;

  if (!cutter) {
    return NextResponse.json({ error: 'Cutter nicht gefunden' }, { status: 404 });
  }

  const token   = randomUUID();
  const expires = new Date(Date.now() + INVITE_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `UPDATE cutters SET magic_token = ?, token_expires_at = ? WHERE id = ?`,
    args: [token, expires, id],
  });

  // Await the email — don't fire-and-forget (serverless needs to stay alive)
  let emailSent = false;
  let emailError: string | null = null;
  try {
    await sendInviteEmail(cutter.email, cutter.name, token, auth.name);
    emailSent = true;
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error('[invite] email failed:', emailError);
  }

  return NextResponse.json({
    success: true,
    email: cutter.email,
    token,
    email_sent: emailSent,
    email_error: emailError,
  });
}
