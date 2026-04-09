import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  const scoreResult = await db.execute({
    sql: `SELECT rs.score, rs.total_videos, rs.verified_count, rs.last_calculated_at
          FROM reliability_scores rs WHERE rs.cutter_id = ?`,
    args: [auth.id],
  });
  const scoreRow = scoreResult.rows[0] as unknown as {
    score: number;
    total_videos: number;
    verified_count: number;
    last_calculated_at: string;
  } | undefined;

  return NextResponse.json({
    id: auth.id,
    name: auth.name,
    email: auth.email,
    company_name: auth.company_name,
    company_address: auth.company_address,
    tax_id: auth.tax_id,
    iban: auth.iban,
    rate_per_view: auth.rate_per_view,
    created_at: auth.created_at,
    reliability_score: scoreRow
      ? {
          score: scoreRow.score,
          total_videos: scoreRow.total_videos,
          verified_count: scoreRow.verified_count,
          last_calculated_at: scoreRow.last_calculated_at,
        }
      : null,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const body = await request.json();
  const db = await ensureDb();

  const allowedFields = ['name', 'company_name', 'company_address', 'tax_id', 'iban'];
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

  values.push(auth.id);
  await db.execute({
    sql: `UPDATE cutters SET ${updates.join(', ')} WHERE id = ?`,
    args: values,
  });

  return NextResponse.json({ success: true });
}
