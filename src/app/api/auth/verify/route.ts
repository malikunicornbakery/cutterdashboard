import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, createSessionCookie } from '@/lib/cutter/auth';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(
      new URL('/login?error=missing_token', request.url)
    );
  }

  const result = await verifyMagicToken(token);

  if (!result) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_token', request.url)
    );
  }

  const response = NextResponse.redirect(
    new URL('/dashboard', request.url)
  );

  response.headers.set('Set-Cookie', createSessionCookie(result.sessionToken));

  return response;
}
