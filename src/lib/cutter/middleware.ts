import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionCookie } from './jwt';
import { can, type Permission, type Role } from '@/lib/permissions';
import type { CutterRow } from './auth';

/**
 * Authenticate from JWT cookie — zero DB calls.
 * Returns a CutterRow-compatible object or a 401 response.
 */
export async function requireCutterAuth(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  const token   = getSessionCookie(request);
  const session = await verifySession(token);

  if (!session || !session.is_active) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  // Return session payload shaped as CutterRow
  return session as unknown as CutterRow;
}

export async function requirePermission(
  request: NextRequest,
  permission: Permission
): Promise<CutterRow | NextResponse> {
  const result = await requireCutterAuth(request);
  if (result instanceof NextResponse) return result;

  if (!can(result.role as Role, permission)) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  return result;
}

export async function requireCutterAdmin(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  return requirePermission(request, 'USER_MANAGE');
}

export async function requireOpsAccess(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  return requirePermission(request, 'OPS_READ');
}

export function isCutter(
  result: CutterRow | NextResponse
): result is CutterRow {
  return !(result instanceof NextResponse);
}
