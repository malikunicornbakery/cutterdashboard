import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/cutter/jwt';

export async function POST() {
  // JWT is stateless — just clear the cookie, no DB call needed
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}
