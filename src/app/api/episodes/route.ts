import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT e.*, COUNT(v.id) as video_count,
                 COALESCE(SUM(v.current_views), 0) as total_views
          FROM episodes e
          LEFT JOIN cutter_videos v ON v.episode_id = e.id
          WHERE e.cutter_id = ?
          GROUP BY e.id
          ORDER BY e.created_at DESC`,
    args: [auth.id],
  });

  return NextResponse.json({ episodes: result.rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { title, description, platform } = await request.json();

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Titel ist erforderlich' }, { status: 400 });
  }

  const validPlatforms = ['tiktok', 'youtube', 'instagram', 'facebook'];
  if (platform && !validPlatforms.includes(platform)) {
    return NextResponse.json({ error: 'Ungültige Plattform' }, { status: 400 });
  }

  const db = await ensureDb();
  const id = randomUUID();

  await db.execute({
    sql: `INSERT INTO episodes (id, cutter_id, title, description, platform) VALUES (?, ?, ?, ?, ?)`,
    args: [id, auth.id, title.trim(), description ?? null, platform ?? null],
  });

  return NextResponse.json({ id, title: title.trim() });
}
