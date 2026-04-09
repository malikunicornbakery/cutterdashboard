import { randomUUID } from 'crypto';
import type { DbClient } from '@/lib/db';

export function calculateScore(stats: {
  total_videos: number;
  verified_count: number;
  suspicious_count: number;
  critical_count: number;
  proof_approved_count: number;
}): number {
  const { total_videos, verified_count, suspicious_count, critical_count, proof_approved_count } = stats;
  if (total_videos === 0) return 100;
  const positive = verified_count + proof_approved_count;
  const positiveRate = positive / total_videos;
  const suspiciousRate = suspicious_count / total_videos;
  const criticalRate = critical_count / total_videos;
  const raw = positiveRate * 100 - suspiciousRate * 20 - criticalRate * 40;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export async function recalculateReliabilityScore(db: DbClient, cutterId: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT
      COUNT(*) as total_videos,
      SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN discrepancy_status = 'suspicious_difference' THEN 1 ELSE 0 END) as suspicious_count,
      SUM(CASE WHEN discrepancy_status = 'critical_difference' THEN 1 ELSE 0 END) as critical_count,
      SUM(CASE WHEN proof_status = 'approved' THEN 1 ELSE 0 END) as proof_approved_count
    FROM cutter_videos WHERE cutter_id = ?`,
    args: [cutterId],
  });
  const row = result.rows[0] as any;
  const stats = {
    total_videos: Number(row.total_videos) || 0,
    verified_count: Number(row.verified_count) || 0,
    suspicious_count: Number(row.suspicious_count) || 0,
    critical_count: Number(row.critical_count) || 0,
    proof_approved_count: Number(row.proof_approved_count) || 0,
  };
  const score = calculateScore(stats);
  await db.execute({
    sql: `INSERT INTO reliability_scores (id, cutter_id, score, total_videos, verified_count, suspicious_count, critical_count, proof_approved_count, last_calculated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(cutter_id) DO UPDATE SET
            score = excluded.score,
            total_videos = excluded.total_videos,
            verified_count = excluded.verified_count,
            suspicious_count = excluded.suspicious_count,
            critical_count = excluded.critical_count,
            proof_approved_count = excluded.proof_approved_count,
            last_calculated_at = excluded.last_calculated_at`,
    args: [randomUUID(), cutterId, score, stats.total_videos, stats.verified_count, stats.suspicious_count, stats.critical_count, stats.proof_approved_count],
  });
  return score;
}
