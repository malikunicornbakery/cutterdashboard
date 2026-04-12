import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { signSession, makeSessionCookie } from '@/lib/cutter/jwt';
import type { CutterRow } from '@/lib/cutter/auth';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const scoreResult = await db.execute({
    sql: `SELECT score, total_videos, verified_count, last_calculated_at
          FROM reliability_scores WHERE cutter_id = ?`,
    args: [auth.id],
  });
  const scoreRow = scoreResult.rows[0] as unknown as {
    score: number; total_videos: number;
    verified_count: number; last_calculated_at: string;
  } | undefined;

  return NextResponse.json({
    id: auth.id, name: auth.name, email: auth.email,
    company_name: auth.company_name, company_address: auth.company_address,
    tax_id: auth.tax_id, iban: auth.iban,
    rate_per_view: auth.rate_per_view, created_at: auth.created_at,
    reliability_score: scoreRow ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const body = await request.json();
  const db   = await ensureDb();

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

  // Re-issue JWT with updated profile data so changes are reflected immediately
  const updated: CutterRow = {
    ...auth,
    name:            body.name            ?? auth.name,
    company_name:    body.company_name    ?? auth.company_name,
    company_address: body.company_address ?? auth.company_address,
    tax_id:          body.tax_id          ?? auth.tax_id,
    iban:            body.iban            ?? auth.iban,
  };
  const jwt      = await signSession(updated);
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', makeSessionCookie(jwt));
  return response;
}
