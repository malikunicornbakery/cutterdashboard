import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  const invoiceResult = await db.execute({
    sql: `SELECT * FROM cutter_invoices WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });
  const invoice = invoiceResult.rows[0];

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 });
  }

  const itemsResult = await db.execute({
    sql: `SELECT * FROM cutter_invoice_items WHERE invoice_id = ? ORDER BY views_in_period DESC`,
    args: [id],
  });

  return NextResponse.json({ invoice, items: itemsResult.rows });
}
