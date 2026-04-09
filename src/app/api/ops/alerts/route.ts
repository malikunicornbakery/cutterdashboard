import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookie } from '@/lib/cutter/auth';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: args.map(a =>
              a === null
                ? { type: 'null' }
                : typeof a === 'number'
                ? { type: 'integer', value: String(Math.round(a)) }
                : { type: 'text', value: String(a) }
            ),
          },
        },
        { type: 'close' },
      ],
    }),
  });
  const data = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result ?? { rows: [], cols: [] };
}

function val(cell: unknown): string | null {
  if (cell == null) return null;
  const c = cell as { value: string | null };
  return c.value ?? null;
}

function intVal(cell: unknown): number | null {
  const v = val(cell);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function floatVal(cell: unknown): number | null {
  const v = val(cell);
  if (v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore.get('cutter_session')?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'super_admin' && session.role !== 'ops_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [discrepanciesResult, notSyncedResult, pendingProofResult, unverifiedResult] = await Promise.all([
    dbQuery(
      `SELECT v.id, v.platform, v.url, v.title, v.claimed_views, v.current_views,
              v.discrepancy_status, v.discrepancy_percent, v.created_at, c.name as cutter_name
       FROM cutter_videos v JOIN cutters c ON c.id = v.cutter_id
       WHERE v.discrepancy_status IN ('suspicious_difference','critical_difference')
         AND v.is_flagged = 0
       ORDER BY v.discrepancy_percent DESC LIMIT 20`
    ),
    dbQuery(
      `SELECT v.id, v.platform, v.url, v.title, v.current_views, v.last_scraped_at, c.name as cutter_name
       FROM cutter_videos v JOIN cutters c ON c.id = v.cutter_id
       WHERE (v.last_scraped_at IS NULL OR v.last_scraped_at < datetime('now', '-7 days'))
       ORDER BY v.created_at DESC LIMIT 20`
    ),
    dbQuery(
      `SELECT v.id, v.platform, v.url, v.title, v.claimed_views, v.current_views,
              v.proof_status, v.proof_uploaded_at, c.name as cutter_name
       FROM cutter_videos v JOIN cutters c ON c.id = v.cutter_id
       WHERE v.proof_status = 'submitted'
       ORDER BY v.proof_uploaded_at ASC LIMIT 20`
    ),
    dbQuery(
      `SELECT v.id, v.platform, v.url, v.title, v.claimed_views, c.name as cutter_name, v.created_at
       FROM cutter_videos v JOIN cutters c ON c.id = v.cutter_id
       WHERE v.verification_status IN ('claimed_only', 'unavailable', 'unverified')
         AND v.created_at < datetime('now', '-3 days')
       ORDER BY v.created_at ASC LIMIT 20`
    ),
  ]);

  const discrepancies = discrepanciesResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    platform: val(row[1]),
    url: val(row[2]),
    title: val(row[3]),
    claimed_views: intVal(row[4]),
    current_views: intVal(row[5]),
    discrepancy_status: val(row[6]),
    discrepancy_percent: floatVal(row[7]),
    created_at: val(row[8]),
    cutter_name: val(row[9]),
  }));

  const notSynced = notSyncedResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    platform: val(row[1]),
    url: val(row[2]),
    title: val(row[3]),
    current_views: intVal(row[4]),
    last_scraped_at: val(row[5]),
    cutter_name: val(row[6]),
  }));

  const pendingProof = pendingProofResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    platform: val(row[1]),
    url: val(row[2]),
    title: val(row[3]),
    claimed_views: intVal(row[4]),
    current_views: intVal(row[5]),
    proof_status: val(row[6]),
    proof_uploaded_at: val(row[7]),
    cutter_name: val(row[8]),
  }));

  const unverified = unverifiedResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    platform: val(row[1]),
    url: val(row[2]),
    title: val(row[3]),
    claimed_views: intVal(row[4]),
    cutter_name: val(row[5]),
    created_at: val(row[6]),
  }));

  return NextResponse.json({
    discrepancies,
    notSynced,
    pendingProof,
    unverified,
    counts: {
      discrepancies: discrepancies.length,
      notSynced: notSynced.length,
      pendingProof: pendingProof.length,
      unverified: unverified.length,
      total: discrepancies.length + notSynced.length + pendingProof.length + unverified.length,
    },
  });
}
