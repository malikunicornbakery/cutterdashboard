import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

const VALID_PLATFORMS = ['tiktok', 'youtube', 'instagram', 'facebook'];

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT * FROM cutter_accounts WHERE cutter_id = ? ORDER BY platform`,
    args: [auth.id],
  });

  return NextResponse.json({ accounts: result.rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { platform, account_handle, account_url } = await request.json();

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: 'Ungültige Plattform. Erlaubt: ' + VALID_PLATFORMS.join(', ') },
      { status: 400 }
    );
  }

  if (!account_handle || typeof account_handle !== 'string') {
    return NextResponse.json(
      { error: 'Account-Handle erforderlich' },
      { status: 400 }
    );
  }

  const db = await ensureDb();

  // Check if platform already linked
  const existingResult = await db.execute({
    sql: `SELECT id FROM cutter_accounts WHERE cutter_id = ? AND platform = ?`,
    args: [auth.id, platform],
  });

  if (existingResult.rows[0]) {
    return NextResponse.json(
      { error: `Du hast bereits ein ${platform}-Konto verknüpft. Lösche es zuerst, um ein neues zu verknüpfen.` },
      { status: 409 }
    );
  }

  const id = randomUUID();
  const handle = account_handle.trim().replace(/^@/, '').toLowerCase();

  await db.execute({
    sql: `INSERT INTO cutter_accounts (id, cutter_id, platform, account_handle, account_url) VALUES (?, ?, ?, ?, ?)`,
    args: [id, auth.id, platform, handle, account_url || null],
  });

  return NextResponse.json({ id, platform, account_handle: handle });
}
