import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { getNotifications, markAllRead } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');

  const result = await getNotifications(db, auth.id, { unreadOnly, limit, offset });
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const body = await request.json();
  if (body.action !== 'mark_all_read') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const db = await ensureDb();
  await markAllRead(db, auth.id);
  return NextResponse.json({ success: true });
}
