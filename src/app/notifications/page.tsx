"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { Bell, Check, RefreshCw, ExternalLink, ChevronRight } from "lucide-react";
import type { NotificationRow, NotificationType } from "@/lib/notifications";
import { NOTIF_META } from "@/lib/notifications";

// ── Helpers ───────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "gerade eben";
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

const TYPE_LABELS: Record<NotificationType, string> = {
  clip_submitted:         "Clip eingereicht",
  proof_required:         "Beleg angefordert",
  proof_approved:         "Beleg genehmigt",
  proof_rejected:         "Beleg abgelehnt",
  clip_verified:          "Clip verifiziert",
  sync_update:            "Views aktualisiert",
  reminder_proof:         "Erinnerung: Beleg",
  proof_submitted:        "Neuer Beleg",
  discrepancy_suspicious: "Verdächtige Abweichung",
  discrepancy_critical:   "Kritische Abweichung",
  cutter_repeat_issues:   "Wiederholte Probleme",
  reminder_review:        "Erinnerung: Prüfung",
  stale_clip:             "Veralteter Clip",
};

type FilterTab = "all" | "unread" | "proof" | "discrepancy" | "reminder";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all",         label: "Alle" },
  { key: "unread",      label: "Ungelesen" },
  { key: "proof",       label: "Belege" },
  { key: "discrepancy", label: "Abweichungen" },
  { key: "reminder",    label: "Erinnerungen" },
];

const FILTER_TYPES: Record<FilterTab, NotificationType[] | null> = {
  all:         null,
  unread:      null, // handled via unreadOnly flag
  proof:       ["proof_required", "proof_submitted", "proof_approved", "proof_rejected"],
  discrepancy: ["discrepancy_suspicious", "discrepancy_critical"],
  reminder:    ["reminder_proof", "reminder_review"],
};

// ── Notification Row ──────────────────────────────────────────

function NotifRow({
  n,
  onMarkRead,
}: {
  n: NotificationRow;
  onMarkRead: (id: string) => void;
}) {
  const meta = NOTIF_META[n.type] ?? NOTIF_META.clip_submitted;
  const isUnread = n.is_read === 0;

  const content = (
    <div
      className={`group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-accent/30 cursor-pointer ${isUnread ? "bg-primary/4" : ""}`}
      onClick={() => { if (isUnread) onMarkRead(n.id); }}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${meta.bg} ${meta.border} border`}>
        <span className={meta.color}>{meta.icon}</span>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                {n.title}
              </p>
              <span className={`rounded-md px-1.5 py-0.5 text-xs ${meta.bg} ${meta.color} border ${meta.border}`}>
                {TYPE_LABELS[n.type] ?? n.type}
              </span>
            </div>
            {n.body && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
            )}
            <p className="text-xs text-muted-foreground/60 mt-1">{formatRelative(n.created_at)}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            )}
            {n.action_url && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return n.action_url ? (
    <Link href={n.action_url} className="block">{content}</Link>
  ) : (
    <div>{content}</div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async (tab: FilterTab, off: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(off),
        ...(tab === "unread" ? { unread: "true" } : {}),
      });
      const res = await fetch(`/api/notifications?${params}`);
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();

      let list: NotificationRow[] = data.notifications ?? [];

      // Client-side type filter (for tabs other than unread)
      const types = FILTER_TYPES[tab];
      if (types) {
        list = list.filter((n) => types.includes(n.type));
      }

      setNotifications((prev) => append ? [...prev, ...list] : list);
      setUnreadCount(data.unreadCount ?? 0);
      setTotal(data.total ?? 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    setOffset(0);
    setNotifications([]);
    load(activeTab, 0);
  }, [activeTab, load]);

  async function markOne(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
  }

  async function markAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
  }

  function loadMore() {
    const next = offset + LIMIT;
    setOffset(next);
    load(activeTab, next, true);
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-2xl p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Benachrichtigungen
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                <span className="text-primary font-semibold">{unreadCount}</span> ungelesen
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Check className="h-4 w-4" />
                Alle als gelesen
              </button>
            )}
            <button
              onClick={() => load(activeTab, 0)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none rounded-xl border border-border bg-card p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.key === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Lädt…</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Bell className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="font-medium text-muted-foreground">Keine Benachrichtigungen</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                {activeTab === "unread" ? "Alles gelesen — gut gemacht!" : "Hier erscheinen deine Benachrichtigungen."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((n) => (
                <NotifRow key={n.id} n={n} onMarkRead={markOne} />
              ))}
            </div>
          )}

          {/* Load more */}
          {!loading && notifications.length > 0 && notifications.length < total && (
            <div className="border-t border-border p-3 text-center">
              <button
                onClick={loadMore}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mx-auto"
              >
                Weitere laden
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

      </main>
    </>
  );
}
