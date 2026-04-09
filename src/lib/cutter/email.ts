import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendMagicLinkEmail(email: string, token: string) {
  const baseUrl =
    process.env.CUTTER_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000';
  const link = `${baseUrl}/api/auth/verify?token=${token}`;

  // Always log for debugging
  console.log(`[Magic Link] ${email} → ${link}`);

  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set, skipping email send');
    return;
  }

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Cutter Dashboard <onboarding@resend.dev>',
    to: email,
    subject: 'Dein Login-Link — Cutter Dashboard',
    html: `
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
  });
}
