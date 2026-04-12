import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionCookie } from '@/lib/cutter/jwt';

export async function GET(request: NextRequest) {
  const session = await verifySession(getSessionCookie(request));

  if (!session) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  return NextResponse.json({
    id:           session.id,
    name:         session.name,
    email:        session.email,
    company_name: session.company_name,
    is_admin:     session.role === 'super_admin',
    role:         session.role,
  });
}
