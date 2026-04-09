import { NextRequest, NextResponse } from 'next/server';
import { generateMagicToken } from '@/lib/cutter/auth';
import { sendMagicLinkEmail } from '@/lib/cutter/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

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

    await sendMagicLinkEmail(email.trim().toLowerCase(), token);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Magic link error:', err);
    return NextResponse.json(
      { error: 'Interner Fehler' },
      { status: 500 }
    );
  }
}
