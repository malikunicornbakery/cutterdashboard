/**
 * JWT-based session management.
 * Replaces DB session lookups with cryptographic verification.
 * No database round trip needed to authenticate any request.
 */
import { SignJWT, jwtVerify } from 'jose';
import type { CutterRow } from './auth';

const SESSION_COOKIE = 'cutter_session';
const EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || 'cutter-dashboard-dev-secret-change-in-prod';
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: number;
  is_admin: number;
  rate_per_view: number;
  company_name: string | null;
  company_address: string | null;
  tax_id: string | null;
  iban: string | null;
  created_at: string;
}

/** Create a signed JWT from a cutter row */
export async function signSession(cutter: CutterRow): Promise<string> {
  const payload: SessionPayload = {
    id:              cutter.id,
    name:            cutter.name,
    email:           cutter.email,
    role:            cutter.role,
    is_active:       cutter.is_active,
    is_admin:        cutter.is_admin,
    rate_per_view:   cutter.rate_per_view,
    company_name:    cutter.company_name,
    company_address: cutter.company_address,
    tax_id:          cutter.tax_id,
    iban:            cutter.iban,
    created_at:      cutter.created_at,
  };

  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(getSecret());
}

/** Verify and decode a JWT — pure CPU, zero DB calls */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Build a Set-Cookie header value for the JWT */
export function makeSessionCookie(jwt: string): string {
  return `${SESSION_COOKIE}=${jwt}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${EXPIRY_SECONDS}`;
}

/** Build a Set-Cookie header that clears the session */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Extract the raw session cookie value from a request */
export function getSessionCookie(request: { cookies: { get: (name: string) => { value: string } | undefined } }): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value;
}
