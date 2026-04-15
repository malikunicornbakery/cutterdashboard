import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookie } from '@/lib/cutter/auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cutterdashboard-85kk5pbh2-unicorn-bakery.vercel.app';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('cutter_session')?.value;

  const cutter = await getSessionFromCookie(sessionToken);
  if (!cutter) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID || '',
    redirect_uri: `${APP_URL}/api/auth/instagram/callback`,
    response_type: 'code',
    scope: 'instagram_basic,instagram_manage_insights',
    state: sessionToken as string,
  });

  const oauthUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;

  return NextResponse.redirect(oauthUrl);
}
