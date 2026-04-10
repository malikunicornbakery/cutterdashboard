/**
 * Vercel Cron — täglich 10:00 Uhr UTC
 * Reminder + Stale-clip sweep
 *
 * Runs after sync (04:00) to catch any overnight changes.
 * Creates notifications for:
 *   1. Cutters with overdue proof (proof_requested >48h, no submission)
 *   2. Ops: proofs submitted >24h ago, not yet reviewed
 *   3. Ops: clips not synced in >7 days
 *   4. Ops: cutters with ≥3 suspicious/critical clips (repeated issues)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import {
  createNotification,
  createOpsNotification,
  getProofReminderTargets,
  getReviewReminderTargets,
  getStaleClipTargets,
} from '@/lib/notifications';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await ensureDb();
  const stats = {
    proofReminders: 0,
    reviewReminders: 0,
    staleClips: 0,
    repeatIssues: 0,
    discrepancies: 0,
  };

  // ── 1. Proof reminders → cutter ──────────────────────────────
  const proofTargets = await getProofReminderTargets(db);
  for (const t of proofTargets) {
    await createNotification(db, {
      recipientId: t.cutterId,
      type: 'reminder_proof',
      title: 'Erinnerung: Beleg ausstehend',
      body: `Für "${t.videoTitle ?? 'dein Clip'}" wurde ein Screenshot angefordert. Bitte lade ihn so bald wie möglich hoch.`,
      actionUrl: '/videos',
      entityType: 'video',
      entityId: t.videoId,
      dedupWindowHours: 48,
    });
    stats.proofReminders++;
  }

  // ── 2. Review reminders → ops ─────────────────────────────────
  const reviewTargets = await getReviewReminderTargets(db);
  for (const t of reviewTargets) {
    await createOpsNotification(db, {
      type: 'reminder_review',
      title: 'Beleg wartet auf Prüfung',
      body: `"${t.videoTitle ?? 'Clip'}" von ${t.cutterName} wartet seit über 24h auf Prüfung.`,
      actionUrl: '/ops/verification',
      entityType: 'video',
      entityId: t.videoId,
      dedupWindowHours: 24,
    });
    stats.reviewReminders++;
  }

  // ── 3. Stale clips → ops ──────────────────────────────────────
  const staleTargets = await getStaleClipTargets(db);
  for (const t of staleTargets) {
    await createOpsNotification(db, {
      type: 'stale_clip',
      title: 'Clip nicht synchronisiert',
      body: `"${t.videoTitle ?? 'Clip'}" von ${t.cutterName} wurde seit über 7 Tagen nicht synchronisiert.`,
      actionUrl: t.videoId ? `/ops/clips/${t.videoId}` : '/ops/clips',
      entityType: 'video',
      entityId: t.videoId,
      dedupWindowHours: 48,
    });
    stats.staleClips++;
  }

  // ── 4. Repeated issues → ops ──────────────────────────────────
  const repeatResult = await db.execute(`
    SELECT c.id as cutter_id, c.name as cutter_name,
           COUNT(*) as issue_count
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE v.discrepancy_status IN ('suspicious_difference', 'critical_difference')
      AND c.is_active = 1
    GROUP BY c.id, c.name
    HAVING COUNT(*) >= 3
  `);

  for (const row of repeatResult.rows) {
    const r = row as Record<string, unknown>;
    const cutterId = String(r.cutter_id ?? '');
    const cutterName = String(r.cutter_name ?? '');
    const count = Number(r.issue_count ?? 0);

    await createOpsNotification(db, {
      type: 'cutter_repeat_issues',
      title: 'Wiederholte Abweichungen',
      body: `${cutterName} hat ${count} Clips mit verdächtigen oder kritischen Abweichungen.`,
      actionUrl: `/ops/cutters/${cutterId}`,
      entityType: 'cutter',
      entityId: cutterId,
      dedupWindowHours: 72,
    });
    stats.repeatIssues++;
  }

  // ── 5. Unresolved discrepancies → ops ─────────────────────────
  const discResult = await db.execute(`
    SELECT v.id as video_id, v.title, v.discrepancy_status, v.discrepancy_percent,
           c.name as cutter_name
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE v.discrepancy_status = 'critical_difference'
      AND v.proof_status NOT IN ('proof_approved', 'proof_submitted', 'proof_under_review')
      AND (v.reviewed_at IS NULL OR v.reviewed_at < datetime('now', '-24 hours'))
    LIMIT 20
  `);

  for (const row of discResult.rows) {
    const r = row as Record<string, unknown>;
    const videoId = String(r.video_id ?? '');
    const title = r.title ? String(r.title) : 'Clip';
    const cutterName = String(r.cutter_name ?? '');
    const pct = r.discrepancy_percent ? `${Number(r.discrepancy_percent).toFixed(1)}%` : '';

    await createOpsNotification(db, {
      type: 'discrepancy_critical',
      title: 'Kritische Abweichung ungelöst',
      body: `"${title}" von ${cutterName} — Abweichung${pct ? ` ${pct}` : ''} noch nicht bearbeitet.`,
      actionUrl: `/ops/clips/${videoId}`,
      entityType: 'video',
      entityId: videoId,
      dedupWindowHours: 24,
    });
    stats.discrepancies++;
  }

  console.log('[CRON reminders]', stats);
  return NextResponse.json({ success: true, ...stats });
}
