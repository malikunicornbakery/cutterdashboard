import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/cutter/helpers';
import { writeAuditLog } from '@/lib/audit';

interface VideoRow {
  id: string;
  platform: string;
  url: string;
  title: string | null;
  current_views: number;
  views_at_last_invoice: number;
}

interface SettingRow {
  key: string;
  value: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  const ratePerView = auth.rate_per_view;

  // Get all videos for this cutter
  const videosResult = await db.execute({
    sql: `SELECT * FROM cutter_videos WHERE cutter_id = ?`,
    args: [auth.id],
  });
  const videos = videosResult.rows as unknown as VideoRow[];

  // Calculate deltas
  const billableItems = videos
    .filter((v) => v.current_views > v.views_at_last_invoice)
    .map((v) => ({
      video: v,
      deltaViews: v.current_views - v.views_at_last_invoice,
      amount: (v.current_views - v.views_at_last_invoice) * ratePerView,
    }));

  if (billableItems.length === 0) {
    return NextResponse.json({ error: 'Keine abrechenbaren Views vorhanden.' }, { status: 400 });
  }

  const totalViews = billableItems.reduce((s, i) => s + i.deltaViews, 0);
  const totalAmount = billableItems.reduce((s, i) => s + i.amount, 0);

  // Generate sequential invoice number
  const invoiceNumber = await generateInvoiceNumber(db);

  // Determine period
  const lastInvoiceResult = await db.execute({
    sql: `SELECT period_end FROM cutter_invoices WHERE cutter_id = ? ORDER BY created_at DESC LIMIT 1`,
    args: [auth.id],
  });
  const lastInvoice = lastInvoiceResult.rows[0] as unknown as { period_end: string } | undefined;

  const periodStart = lastInvoice?.period_end || auth.created_at;
  const periodEnd = new Date().toISOString();

  // Get recipient company from settings
  const settingsResult = await db.execute(
    `SELECT key, value FROM cutter_settings WHERE key LIKE 'recipient_%'`
  );
  const settings = settingsResult.rows as unknown as SettingRow[];
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const recipientCompany = JSON.stringify({
    name: settingsMap['recipient_company_name'] || '',
    address: settingsMap['recipient_company_address'] || '',
    taxId: settingsMap['recipient_tax_id'] || '',
  });

  const senderCompany = JSON.stringify({
    name: auth.company_name || auth.name,
    address: auth.company_address || '',
    taxId: auth.tax_id || '',
    iban: auth.iban || '',
  });

  // Build stmts array for the transaction
  const invoiceId = randomUUID();
  const stmts: Array<{ sql: string; args?: any[] }> = [];

  // Create invoice
  stmts.push({
    sql: `INSERT INTO cutter_invoices (id, cutter_id, invoice_number, period_start, period_end, total_views, total_amount, rate_per_view, status, recipient_company, sender_company)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    args: [
      invoiceId,
      auth.id,
      invoiceNumber,
      periodStart,
      periodEnd,
      totalViews,
      totalAmount,
      ratePerView,
      recipientCompany,
      senderCompany,
    ],
  });

  // Create invoice items
  for (const item of billableItems) {
    stmts.push({
      sql: `INSERT INTO cutter_invoice_items (id, invoice_id, video_id, video_title, video_url, platform, views_in_period, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        invoiceId,
        item.video.id,
        item.video.title || 'Video',
        item.video.url,
        item.video.platform,
        item.deltaViews,
        item.amount,
      ],
    });
  }

  // Update views_at_last_invoice for ALL videos (reset baseline)
  stmts.push({
    sql: `UPDATE cutter_videos SET views_at_last_invoice = current_views WHERE cutter_id = ?`,
    args: [auth.id],
  });

  await db.transaction(stmts);

  // Audit log (after commit, non-blocking)
  await writeAuditLog(db, {
    actorId: auth.id,
    actorName: auth.name,
    action: 'invoice_generate',
    entityType: 'invoice',
    entityId: invoiceId,
    meta: {
      invoice_number: invoiceNumber,
      total_views: totalViews,
      total_amount: totalAmount,
      items_count: billableItems.length,
    },
  });

  return NextResponse.json({
    invoice: {
      id: invoiceId,
      invoice_number: invoiceNumber,
      period_start: periodStart,
      period_end: periodEnd,
      total_views: totalViews,
      total_amount: totalAmount,
      rate_per_view: ratePerView,
      status: 'draft',
      items_count: billableItems.length,
    },
  });
}
