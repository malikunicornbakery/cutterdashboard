import { NextRequest, NextResponse } from 'next/server';
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore.get('cutter_session')?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'super_admin' && session.role !== 'ops_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const [cutterResult, clipsResult, platformResult, auditResult] = await Promise.all([
    dbQuery(
      `SELECT c.id, c.name, c.email, c.role, c.is_active, c.rate_per_view,
              c.monthly_clip_minimum, c.created_at,
              COALESCE(rs.score, 100) as reliability_score,
              rs.total_videos, rs.verified_count, rs.suspicious_count, rs.critical_count
       FROM cutters c
       LEFT JOIN reliability_scores rs ON rs.cutter_id = c.id
       WHERE c.id = ?`,
      [id]
    ),
    dbQuery(
      `SELECT v.id, v.platform, v.url, v.title, v.current_views, v.claimed_views,
              v.verification_status, v.verification_source, v.confidence_level,
              v.discrepancy_status, v.discrepancy_percent, v.is_flagged,
              v.last_scraped_at, v.created_at,
              e.title as episode_title
       FROM cutter_videos v
       LEFT JOIN episodes e ON e.id = v.episode_id
       WHERE v.cutter_id = ?
       ORDER BY v.current_views DESC`,
      [id]
    ),
    dbQuery(
      `SELECT platform, COUNT(*) as count,
              COALESCE(SUM(current_views), 0) as total_views,
              SUM(CASE WHEN verification_status='verified' THEN 1 ELSE 0 END) as verified_count
       FROM cutter_videos WHERE cutter_id = ? GROUP BY platform`,
      [id]
    ),
    dbQuery(
      `SELECT al.actor_name, al.action, al.entity_id, al.meta, al.created_at
       FROM audit_log al
       WHERE al.actor_id = ? OR al.entity_id IN (SELECT id FROM cutter_videos WHERE cutter_id = ?)
       ORDER BY al.created_at DESC LIMIT 20`,
      [id, id]
    ),
  ]);

  if (!cutterResult.rows.length) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const r = cutterResult.rows[0] as unknown[];
  const cutter = {
    id: val(r[0]),
    name: val(r[1]),
    email: val(r[2]),
    role: val(r[3]),
    is_active: intVal(r[4]),
    rate_per_view: floatVal(r[5]),
    monthly_clip_minimum: intVal(r[6]),
    created_at: val(r[7]),
    reliability_score: intVal(r[8]) ?? 100,
    total_videos: intVal(r[9]) ?? 0,
    verified_count: intVal(r[10]) ?? 0,
    suspicious_count: intVal(r[11]) ?? 0,
    critical_count: intVal(r[12]) ?? 0,
  };

  const clips = clipsResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    platform: val(row[1]),
    url: val(row[2]),
    title: val(row[3]),
    current_views: intVal(row[4]),
    claimed_views: intVal(row[5]),
    verification_status: val(row[6]),
    verification_source: val(row[7]),
    confidence_level: intVal(row[8]),
    discrepancy_status: val(row[9]),
    discrepancy_percent: floatVal(row[10]),
    is_flagged: intVal(row[11]) ?? 0,
    last_scraped_at: val(row[12]),
    created_at: val(row[13]),
    episode_title: val(row[14]),
  }));

  const platforms = platformResult.rows.map((row: unknown[]) => ({
    platform: val(row[0]),
    count: intVal(row[1]) ?? 0,
    total_views: intVal(row[2]) ?? 0,
    verified_count: intVal(row[3]) ?? 0,
  }));

  const auditTrail = auditResult.rows.map((row: unknown[]) => ({
    actor_name: val(row[0]),
    action: val(row[1]),
    entity_id: val(row[2]),
    meta: val(row[3]),
    created_at: val(row[4]),
  }));

  return NextResponse.json({ cutter, clips, platforms, auditTrail });
}
