import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/cutter/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('cutter_session')?.value;
  const cutter = await getSessionFromCookie(token);

  if (!cutter) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  return NextResponse.json({
    id: cutter.id,
    name: cutter.name,
    email: cutter.email,
    company_name: cutter.company_name,
    is_admin: cutter.role === 'super_admin',
    role: cutter.role,
  });
}
