/**
 * Notification Engine
 * ════════════════════
 *
 * TYPES (cutter-facing)
 *   clip_submitted       — cutter submitted a clip successfully
 *   proof_required       — ops requested a proof screenshot
 *   proof_approved       — ops approved proof → clip verified
 *   proof_rejected       — ops rejected proof → cutter must re-upload
 *   clip_verified        — clip fully verified by system/ops
 *   sync_update          — views changed significantly after daily sync
 *   reminder_proof       — proof requested >48h ago, still not submitted
 *
 * TYPES (ops/admin-facing)
 *   proof_submitted      — cutter uploaded a proof, needs review
 *   discrepancy_suspicious  — suspicious view discrepancy detected
 *   discrepancy_critical    — critical view discrepancy detected
 *   cutter_repeat_issues — same cutter has ≥3 suspicious/critical clips
 *   reminder_review      — proof submitted >24h ago, not yet reviewed
 *   stale_clip           — clip not synced in >7 days
 *
 * DEDUP RULE
 *   Before inserting, check if a notification of the same type+entity_id
 *   already exists and was created within the dedup window. If yes, skip.
 *   This prevents reminder spam.
 *
 * BROADCAST TO OPS
 *   createOpsNotification() queries all ops_manager + super_admin users
 *   and creates one notification row per person.
 */

import { randomUUID } from 'crypto';
import type { DbClient } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────

export type NotificationType =
  // Cutter
  | 'clip_submitted'
  | 'proof_required'
  | 'proof_approved'
  | 'proof_rejected'
  | 'clip_verified'
  | 'sync_update'
  | 'reminder_proof'
  // Ops / Admin
  | 'proof_submitted'
  | 'discrepancy_suspicious'
  | 'discrepancy_critical'
  | 'cutter_repeat_issues'
  | 'reminder_review'
  | 'stale_clip';

export interface NotificationRow {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: number;
  created_at: string;
  read_at: string | null;
}

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  /** How many hours before a same-type+entity notification can be re-sent (default 24h) */
  dedupWindowHours?: number;
}

// ── Icon + color metadata (used in UI) ────────────────────────

export const NOTIF_META: Record<NotificationType, {
  icon: string;
  color: string;
  bg: string;
  border: string;
}> = {
  clip_submitted:         { icon: '✓',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  proof_required:         { icon: '⚠',  color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20'  },
  proof_approved:         { icon: '✓',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  proof_rejected:         { icon: '✕',  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'     },
  clip_verified:          { icon: '✓',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  sync_update:            { icon: '⟳',  color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20'    },
  reminder_proof:         { icon: '⏰', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
  proof_submitted:        { icon: '📎', color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20'    },
  discrepancy_suspicious: { icon: '⚠',  color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20'  },
  discrepancy_critical:   { icon: '🚨', color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'     },
  cutter_repeat_issues:   { icon: '⚑',  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'     },
  reminder_review:        { icon: '⏰', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
  stale_clip:             { icon: '⏸',  color: 'text-muted-foreground', bg: 'bg-muted/30',   border: 'border-border'         },
};

// ── Core create function ───────────────────────────────────────

export async function createNotification(
  db: DbClient,
  input: CreateNotificationInput
): Promise<void> {
  try {
    const dedupHours = input.dedupWindowHours ?? 24;

    // Dedup check: skip if same type+entity already created within window
    if (input.entityId) {
      const existing = await db.execute({
        sql: `SELECT id FROM notifications
              WHERE recipient_id = ?
                AND type = ?
                AND entity_id = ?
                AND created_at >= datetime('now', '-' || ? || ' hours')
              LIMIT 1`,
        args: [input.recipientId, input.type, input.entityId, dedupHours],
      });
      if (existing.rows.length > 0) return; // already notified
    }

    await db.execute({
      sql: `INSERT INTO notifications
              (id, recipient_id, type, title, body, action_url, entity_type, entity_id, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      args: [
        randomUUID(),
        input.recipientId,
        input.type,
        input.title,
        input.body ?? null,
        input.actionUrl ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
      ],
    });
  } catch (err) {
    // Never crash the main flow
    console.error('[notifications] createNotification failed:', err);
  }
}

// ── Broadcast to all ops users ─────────────────────────────────

export async function createOpsNotification(
  db: DbClient,
  input: Omit<CreateNotificationInput, 'recipientId'>
): Promise<void> {
  try {
    const opsResult = await db.execute(
      `SELECT id FROM cutters WHERE role IN ('super_admin', 'ops_manager') AND is_active = 1`
    );

    for (const row of opsResult.rows) {
      const r = row as Record<string, unknown>;
      const opsId = String(r.id ?? '');
      if (!opsId) continue;
      await createNotification(db, { ...input, recipientId: opsId });
    }
  } catch (err) {
    console.error('[notifications] createOpsNotification failed:', err);
  }
}

// ── Queries ────────────────────────────────────────────────────

export async function getNotifications(
  db: DbClient,
  recipientId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<{ notifications: NotificationRow[]; unreadCount: number; total: number }> {
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;

  const whereUnread = opts.unreadOnly ? 'AND is_read = 0' : '';

  const [listResult, countResult, unreadResult] = await Promise.all([
    db.execute({
      sql: `SELECT id, recipient_id, type, title, body, action_url, entity_type, entity_id,
                   is_read, created_at, read_at
            FROM notifications
            WHERE recipient_id = ? ${whereUnread}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?`,
      args: [recipientId, limit, offset],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as cnt FROM notifications WHERE recipient_id = ? ${whereUnread}`,
      args: [recipientId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as cnt FROM notifications WHERE recipient_id = ? AND is_read = 0`,
      args: [recipientId],
    }),
  ]);

  const notifications = listResult.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id:           String(r.id ?? ''),
      recipient_id: String(r.recipient_id ?? ''),
      type:         String(r.type ?? '') as NotificationType,
      title:        String(r.title ?? ''),
      body:         r.body ? String(r.body) : null,
      action_url:   r.action_url ? String(r.action_url) : null,
      entity_type:  r.entity_type ? String(r.entity_type) : null,
      entity_id:    r.entity_id ? String(r.entity_id) : null,
      is_read:      Number(r.is_read ?? 0),
      created_at:   String(r.created_at ?? ''),
      read_at:      r.read_at ? String(r.read_at) : null,
    } satisfies NotificationRow;
  });

  const total = Number((countResult.rows[0] as Record<string, unknown>)?.cnt ?? 0);
  const unreadCount = Number((unreadResult.rows[0] as Record<string, unknown>)?.cnt ?? 0);

  return { notifications, unreadCount, total };
}

export async function getUnreadCount(db: DbClient, recipientId: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM notifications WHERE recipient_id = ? AND is_read = 0`,
    args: [recipientId],
  });
  return Number((result.rows[0] as Record<string, unknown>)?.cnt ?? 0);
}

export async function markNotificationRead(db: DbClient, notifId: string, recipientId: string): Promise<void> {
  await db.execute({
    sql: `UPDATE notifications SET is_read = 1, read_at = datetime('now')
          WHERE id = ? AND recipient_id = ?`,
    args: [notifId, recipientId],
  });
}

export async function markAllRead(db: DbClient, recipientId: string): Promise<void> {
  await db.execute({
    sql: `UPDATE notifications SET is_read = 1, read_at = datetime('now')
          WHERE recipient_id = ? AND is_read = 0`,
    args: [recipientId],
  });
}

// ── Reminder helpers (used by cron) ───────────────────────────

export interface ProofReminderTarget {
  videoId: string;
  cutterId: string;
  cutterName: string;
  videoTitle: string | null;
  proofRequestedAt: string;
}

export async function getProofReminderTargets(db: DbClient): Promise<ProofReminderTarget[]> {
  // Cutters who had proof_requested >48h ago and haven't submitted yet
  const result = await db.execute(`
    SELECT v.id as video_id, v.title, v.proof_requested_at,
           c.id as cutter_id, c.name as cutter_name
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE v.proof_status = 'proof_requested'
      AND v.proof_requested_at IS NOT NULL
      AND v.proof_requested_at < datetime('now', '-48 hours')
      AND c.is_active = 1
  `);
  return result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      videoId:          String(row.video_id ?? ''),
      cutterId:         String(row.cutter_id ?? ''),
      cutterName:       String(row.cutter_name ?? ''),
      videoTitle:       row.title ? String(row.title) : null,
      proofRequestedAt: String(row.proof_requested_at ?? ''),
    };
  });
}

export interface ReviewReminderTarget {
  videoId: string;
  videoTitle: string | null;
  cutterName: string;
  proofUploadedAt: string;
}

export async function getReviewReminderTargets(db: DbClient): Promise<ReviewReminderTarget[]> {
  // Proofs submitted >24h ago that haven't been reviewed
  const result = await db.execute(`
    SELECT v.id as video_id, v.title, v.proof_uploaded_at,
           c.name as cutter_name
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE v.proof_status = 'proof_submitted'
      AND v.proof_uploaded_at IS NOT NULL
      AND v.proof_uploaded_at < datetime('now', '-24 hours')
  `);
  return result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      videoId:         String(row.video_id ?? ''),
      videoTitle:      row.title ? String(row.title) : null,
      cutterName:      String(row.cutter_name ?? ''),
      proofUploadedAt: String(row.proof_uploaded_at ?? ''),
    };
  });
}

export interface StaleClipTarget {
  videoId: string;
  videoTitle: string | null;
  cutterName: string;
  lastScrapedAt: string | null;
}

export async function getStaleClipTargets(db: DbClient): Promise<StaleClipTarget[]> {
  const result = await db.execute(`
    SELECT v.id as video_id, v.title, v.last_scraped_at,
           c.name as cutter_name
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE (v.last_scraped_at IS NULL OR v.last_scraped_at < datetime('now', '-7 days'))
      AND v.clip_lifecycle NOT IN ('archived', 'deleted')
      AND c.is_active = 1
  `);
  return result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      videoId:      String(row.video_id ?? ''),
      videoTitle:   row.title ? String(row.title) : null,
      cutterName:   String(row.cutter_name ?? ''),
      lastScrapedAt: row.last_scraped_at ? String(row.last_scraped_at) : null,
    };
  });
}
