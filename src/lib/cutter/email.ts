import { Resend } from 'resend';
import nodemailer from 'nodemailer';

// ─── Transports ───────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return (
    process.env.CUTTER_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000'
  );
}

/** Gmail SMTP via App Password — no domain needed */
function getGmailTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

/** Resend — requires verified domain for non-owner recipients */
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getSenderAddress(): string {
  if (process.env.GMAIL_USER) return `Cutter Dashboard <${process.env.GMAIL_USER}>`;
  return process.env.RESEND_FROM_EMAIL || 'Cutter Dashboard <onboarding@resend.dev>';
}

/** Send via Gmail first, fall back to Resend */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const gmail = getGmailTransport();
  if (gmail) {
    await gmail.sendMail({ from: getSenderAddress(), to, subject, html });
    console.log(`[Email/Gmail] → ${to}`);
    return;
  }

  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: getSenderAddress(),
      to,
      subject,
      html,
    });
    console.log(`[Email/Resend] → ${to}`);
    return;
  }

  console.warn('[Email] Kein Transport konfiguriert (GMAIL_USER oder RESEND_API_KEY fehlt)');
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function sendInviteEmail(
  email: string,
  name: string,
  token: string,
  invitedByName: string,
) {
  const link = `${getBaseUrl()}/api/auth/verify?token=${token}`;
  console.log(`[Invite] ${email} → ${link}`);

  await sendEmail(
    email,
    'Du wurdest zum Cutter Dashboard eingeladen',
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
      <div style="margin-bottom: 32px;">
        <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Cutter Dashboard</div>
        <div style="width: 40px; height: 3px; background: #18181b; border-radius: 2px;"></div>
      </div>

      <h2 style="margin: 0 0 12px; font-size: 22px;">Hallo ${name} 👋</h2>
      <p style="margin: 0 0 8px; color: #444; line-height: 1.6;">
        <strong>${invitedByName}</strong> hat dich zum <strong>Cutter Dashboard</strong> eingeladen —
        der Plattform zur Verwaltung deiner Video-Clips, Views und Rechnungen.
      </p>
      <p style="margin: 0 0 28px; color: #444; line-height: 1.6;">
        Klicke auf den Button um dein Konto zu aktivieren und loszulegen:
      </p>

      <a href="${link}" style="display: inline-block; padding: 14px 28px; background: #18181b; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin-bottom: 28px;">
        Konto aktivieren →
      </a>

      <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 8px;">
        <p style="color: #666; font-size: 13px; margin: 0 0 8px;">
          Oder kopiere diesen Link in deinen Browser:
        </p>
        <p style="color: #888; font-size: 12px; word-break: break-all; margin: 0;">
          <a href="${link}" style="color: #888;">${link}</a>
        </p>
      </div>

      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        Dieser Einladungslink ist 7 Tage gültig. Falls du keine Einladung erwartest, ignoriere diese E-Mail.
      </p>
    </div>
    `,
  );
}

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  redirect?: string,
) {
  const redirectParam = redirect ? `&redirect=${encodeURIComponent(redirect)}` : '';
  const link = `${getBaseUrl()}/api/auth/verify?token=${token}${redirectParam}`;
  console.log(`[Magic Link] ${email} → ${link}`);

  await sendEmail(
    email,
    'Dein Login-Link — Cutter Dashboard',
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="margin: 0 0 16px;">Cutter Dashboard</h2>
      <p>Klicke auf den Button um dich einzuloggen:</p>
      <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #18181b; color: #fff; text-decoration: none; border-radius: 8px; margin: 16px 0;">
        Einloggen
      </a>
      <p style="color: #666; font-size: 13px; margin-top: 24px;">
        Oder kopiere diesen Link:<br/>
        <a href="${link}" style="color: #666;">${link}</a>
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">
        Dieser Link ist 15 Minuten gültig. Falls du keinen Login angefordert hast, ignoriere diese E-Mail.
      </p>
    </div>
    `,
  );
}
