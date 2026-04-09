import { formatCurrency, formatNumber } from './helpers';

export interface InvoiceTemplateData {
  invoiceNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  sender: {
    name: string;
    company?: string;
    address?: string;
    taxId?: string;
    iban?: string;
  };
  recipient: {
    name: string;
    address?: string;
    taxId?: string;
  };
  items: Array<{
    position: number;
    title: string;
    platform: string;
    url: string;
    views: number;
    ratePerView: number;
    amount: number;
  }>;
  totalViews: number;
  totalAmount: number;
  ratePerView: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

export function generateInvoiceHtml(data: InvoiceTemplateData): string {
  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.position}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">
          <div style="font-size: 13px;">${escapeHtml(item.title || 'Video')}</div>
          <div style="font-size: 11px; color: #888; margin-top: 2px;">${escapeHtml(item.url)}</div>
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${PLATFORM_LABELS[item.platform] || item.platform}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatNumber(item.views)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.ratePerView)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 500;">${formatCurrency(item.amount)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rechnung ${escapeHtml(data.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
    }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm; }
    @media print {
      .page { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; padding: 16px; background: #f5f5f5; border-bottom: 1px solid #ddd;">
    <button onclick="window.print()" style="padding: 8px 24px; background: #18181b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
      Als PDF drucken
    </button>
  </div>

  <div class="page">
    <!-- Sender header -->
    <div style="margin-bottom: 40px;">
      <div style="font-size: 18px; font-weight: 700;">${escapeHtml(data.sender.company || data.sender.name)}</div>
      ${data.sender.address ? `<div style="color: #666; font-size: 12px; margin-top: 4px;">${escapeHtml(data.sender.address)}</div>` : ''}
      ${data.sender.taxId ? `<div style="color: #666; font-size: 12px;">USt-IdNr.: ${escapeHtml(data.sender.taxId)}</div>` : ''}
    </div>

    <!-- Sender line (DIN 5008) -->
    <div style="font-size: 9px; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 4px;">
      ${escapeHtml(data.sender.name)}${data.sender.address ? ` · ${escapeHtml(data.sender.address)}` : ''}
    </div>

    <!-- Recipient -->
    <div style="margin-bottom: 32px;">
      <div style="font-weight: 500;">${escapeHtml(data.recipient.name)}</div>
      ${data.recipient.address ? `<div>${escapeHtml(data.recipient.address)}</div>` : ''}
      ${data.recipient.taxId ? `<div>USt-IdNr.: ${escapeHtml(data.recipient.taxId)}</div>` : ''}
    </div>

    <!-- Invoice metadata -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
      <div>
        <div style="font-size: 22px; font-weight: 700;">Rechnung</div>
      </div>
      <div style="text-align: right; font-size: 13px;">
        <div><strong>Rechnungsnr.:</strong> ${escapeHtml(data.invoiceNumber)}</div>
        <div><strong>Datum:</strong> ${escapeHtml(data.invoiceDate)}</div>
        <div><strong>Leistungszeitraum:</strong> ${escapeHtml(data.periodStart)} – ${escapeHtml(data.periodEnd)}</div>
      </div>
    </div>

    <!-- Line items -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 50px;">Nr.</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd;">Beschreibung</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 90px;">Plattform</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 90px;">Views</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 90px;">Preis/View</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 100px;">Betrag</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding: 12px;"></td>
          <td style="padding: 12px; text-align: right; font-weight: 600; border-top: 2px solid #1a1a1a;">${formatNumber(data.totalViews)}</td>
          <td style="padding: 12px; border-top: 2px solid #1a1a1a;"></td>
          <td style="padding: 12px; text-align: right; font-weight: 700; font-size: 15px; border-top: 2px solid #1a1a1a;">${formatCurrency(data.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Tax note -->
    <div style="font-size: 12px; color: #666; margin-bottom: 32px; padding: 12px; background: #fafafa; border-radius: 4px;">
      Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
    </div>

    <!-- Payment info -->
    <div style="margin-bottom: 32px;">
      <div style="font-weight: 600; margin-bottom: 8px;">Zahlungsinformationen</div>
      <div style="font-size: 13px;">
        Bitte überweisen Sie den Betrag von <strong>${formatCurrency(data.totalAmount)}</strong>
        innerhalb von <strong>30 Tagen</strong> auf folgendes Konto:
      </div>
      ${data.sender.iban ? `<div style="margin-top: 8px; font-size: 13px;"><strong>IBAN:</strong> ${escapeHtml(data.sender.iban)}</div>` : ''}
      <div style="margin-top: 4px; font-size: 13px;"><strong>Kontoinhaber:</strong> ${escapeHtml(data.sender.company || data.sender.name)}</div>
      <div style="margin-top: 4px; font-size: 13px;"><strong>Verwendungszweck:</strong> ${escapeHtml(data.invoiceNumber)}</div>
    </div>

    <!-- Footer -->
    <div style="font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
      ${escapeHtml(data.sender.company || data.sender.name)}${data.sender.address ? ` · ${escapeHtml(data.sender.address)}` : ''}${data.sender.taxId ? ` · USt-IdNr.: ${escapeHtml(data.sender.taxId)}` : ''}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
