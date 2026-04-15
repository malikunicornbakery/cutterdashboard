import { NextRequest, NextResponse } from 'next/server';
import { generateMagicToken } from '@/lib/cutter/auth';
import { sendMagicLinkEmail } from '@/lib/cutter/email';

export async function POST(request: NextRequest) {
  try {
    const { email, redirect } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'E-Mail-Adresse erforderlich' },
        { status: 400 }
      );
    }

    const token = await generateMagicToken(email.trim().toLowerCase());

    if (!token) {
      return NextResponse.json(
        { error: 'E-Mail-Adresse nicht gefunden' },
        { status: 404 }
      );
    }

    // Only allow relative redirects to prevent open redirect attacks
    const safeRedirect = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : undefined;

    // Build the link so we can return it as fallback (shown on page if email fails)
    const baseUrl = process.env.CUTTER_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '';
    const redirectParam = safeRedirect ? `&redirect=${encodeURIComponent(safeRedirect)}` : '';
    const link = `${baseUrl}/api/auth/verify?token=${token}${redirectParam}`;

    // Fire-and-forget — don't fail the request if email fails
    sendMagicLinkEmail(email.trim().toLowerCase(), token, safeRedirect)
      .catch(err => console.error('[magic-link] email failed:', err));

    return NextResponse.json({ success: true, link });
  } catch (err) {
    console.error('Magic link error:', err);
    return NextResponse.json(
      { error: 'Interner Fehler' },
      { status: 500 }
    );
  }
}
