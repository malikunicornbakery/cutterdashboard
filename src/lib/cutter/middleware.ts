import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie, hasOpsAccess, isSuperAdmin, type CutterRow } from './auth';

/**
 * Require cutter authentication for an API route.
 * Returns the cutter row if authenticated, or a 401 JSON response.
 */
export async function requireCutterAuth(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  const token = request.cookies.get('cutter_session')?.value;
  const cutter = await getSessionFromCookie(token);

  if (!cutter) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  return cutter;
}

/**
 * Require super_admin role (full access).
 */
export async function requireCutterAdmin(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  const result = await requireCutterAuth(request);
  if (result instanceof NextResponse) return result;

  if (!isSuperAdmin(result)) {
    return NextResponse.json({ error: 'Kein Admin-Zugang' }, { status: 403 });
  }

  return result;
}

/**
 * Require ops access (super_admin or ops_manager).
 */
export async function requireOpsAccess(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  const result = await requireCutterAuth(request);
  if (result instanceof NextResponse) return result;

  if (!hasOpsAccess(result)) {
    return NextResponse.json({ error: 'Kein Ops-Zugang' }, { status: 403 });
  }

  return result;
}

/**
 * Type guard: check if the result is a cutter (not an error response).
 */
export function isCutter(
  result: CutterRow | NextResponse
): result is CutterRow {
  return !(result instanceof NextResponse);
}
