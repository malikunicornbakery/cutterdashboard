import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { generateInvoiceHtml, type InvoiceTemplateData } from '@/lib/cutter/invoice-template';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_views: number;
  total_amount: number;
  rate_per_view: number;
  sender_company: string;
  recipient_company: string;
  created_at: string;
}

interface ItemRow {
  video_title: string;
  video_url: string;
  platform: string;
  views_in_period: number;
  amount: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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
  const invoice = invoiceResult.rows[0] as unknown as InvoiceRow | undefined;

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 });
  }

  const itemsResult = await db.execute({
    sql: `SELECT * FROM cutter_invoice_items WHERE invoice_id = ? ORDER BY views_in_period DESC`,
    args: [id],
  });
  const items = itemsResult.rows as unknown as ItemRow[];

  const sender = JSON.parse(invoice.sender_company || '{}');
  const recipient = JSON.parse(invoice.recipient_company || '{}');

  const templateData: InvoiceTemplateData = {
    invoiceNumber: invoice.invoice_number,
    invoiceDate: formatDate(invoice.created_at),
    periodStart: formatDate(invoice.period_start),
    periodEnd: formatDate(invoice.period_end),
    sender: {
      name: sender.name || auth.name,
      company: sender.name,
      address: sender.address,
      taxId: sender.taxId,
      iban: sender.iban,
    },
    recipient: {
      name: recipient.name || '',
      address: recipient.address,
      taxId: recipient.taxId,
    },
    items: items.map((item, i) => ({
      position: i + 1,
      title: item.video_title,
      platform: item.platform,
      url: item.video_url,
      views: item.views_in_period,
      ratePerView: invoice.rate_per_view,
      amount: item.amount,
    })),
    totalViews: invoice.total_views,
    totalAmount: invoice.total_amount,
    ratePerView: invoice.rate_per_view,
  };

  const html = generateInvoiceHtml(templateData);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
