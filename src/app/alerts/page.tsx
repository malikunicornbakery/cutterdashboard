"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  AlertTriangle, CheckCircle, Clock, RefreshCw,
  ExternalLink, ShieldAlert, Eye, FileQuestion, Inbox,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────
type Severity = "critical" | "high" | "medium" | "low";
type AlertStatus = "open" | "acknowledged" | "in_review" | "resolved" | "dismissed";
type AlertType =
  | "discrepancy_critical"
  | "discrepancy_suspicious"
  | "proof_submitted"
  | "proof_overdue"
  | "sync_stale"
  | "no_verification";

interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  title: string;
  detail: string;
  meta: Record<string, unknown>;
  triggered_at: string;
  updated_at: string;
  video_id: string;
  video_title: string | null;
  video_url: string;
  platform: string;
}

// ── Display config ────────────────────────────────────────────────
const SEVERITY_META: Record<Severity, {
  label: string; color: string; bg: string; border: string; dot: string;
}> = {
  critical: { label: "Kritisch",  color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    dot: "bg-red-500"    },
  high:     { label: "Hoch",      color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "bg-orange-500" },
  medium:   { label: "Mittel",    color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-500" },
  low:      { label: "Niedrig",   color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30",   dot: "bg-blue-400"   },
};

const TYPE_META: Record<AlertType, { label: string; icon: React.ReactNode }> = {
  discrepancy_critical:  { label: "Krit. Diskrepanz",   icon: <ShieldAlert className="h-4 w-4" /> },
  discrepancy_suspicious:{ label: "Verd. Diskrepanz",   icon: <AlertTriangle className="h-4 w-4" /> },
  proof_submitted:       { label: "Beleg ausstehend",   icon: <Clock className="h-4 w-4" /> },
  proof_overdue:         { label: "Beleg überfällig",   icon: <AlertTriangle className="h-4 w-4" /> },
  sync_stale:            { label: "Sync veraltet",      icon: <RefreshCw className="h-4 w-4" /> },
  no_verification:       { label: "Keine Verifikation", icon: <FileQuestion className="h-4 w-4" /> },
};

const STATUS_META: Record<AlertStatus, { label: string; color: string }> = {
  open:         { label: "Offen",         color: "text-red-400"     },
  acknowledged: { label: "Bestätigt",     color: "text-yellow-400"  },
  in_review:    { label: "In Prüfung",    color: "text-blue-400"    },
  resolved:     { label: "Gelöst",        color: "text-emerald-400" },
  dismissed:    { label: "Geschlossen",   color: "text-muted-foreground" },
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};
const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400",
  tiktok: "bg-cyan-500/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-400",
  facebook: "bg-blue-500/10 text-blue-400",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "vor weniger als 1 Std.";
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d !== 1 ? "en" : ""}`;
}

// ── What a cutter should do for each alert type ───────────────────
const ACTION_HINT: Record<AlertType, string> = {
  discrepancy_critical:   "Deine gemeldeten Views weichen stark von den verifizierten ab. Lade bitte einen Screenshot-Nachweis hoch.",
  discrepancy_suspicious: "Deine gemeldeten Views weichen von den verifizierten ab. Unser Team prüft dies.",
  proof_submitted:        "Dein Nachweis wurde empfangen und wird aktuell geprüft. Kein weiterer Handlungsbedarf.",
  proof_overdue:          "Du wurdest gebeten, einen Nachweis einzureichen. Bitte lade so schnell wie möglich einen Screenshot hoch.",
  sync_stale:             "Dieser Clip wurde seit über 7 Tagen nicht synchronisiert. Prüfe ob die URL noch gültig ist.",
  no_verification:        "Views dieses Clips konnten nicht verifiziert werden. Stelle sicher, dass dein Konto verbunden ist.",
};

// ── Alert card ────────────────────────────────────────────────────
function AlertCard({ alert }: { alert: Alert }) {
  const sev = SEVERITY_META[alert.severity];
  const typ = TYPE_META[alert.type];
  const sta = STATUS_META[alert.status];

  return (
    <div className={`rounded-xl border ${sev.border} bg-card overflow-hidden`}>
      {/* Severity stripe */}
      <div className={`h-1 w-full ${sev.dot}`} />

      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`${sev.color} shrink-0`}>{typ.icon}</span>
            <span className={`text-xs font-semibold ${sev.color}`}>{sev.label}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{typ.label}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium ${sta.color}`}>{sta.label}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(alert.triggered_at)}</span>
          </div>
        </div>

        {/* Title */}
        <p className="font-semibold text-sm mb-1">{alert.title}</p>

        {/* Video */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PLATFORM_COLORS[alert.platform] || "bg-muted text-muted-foreground"}`}>
            {PLATFORM_LABELS[alert.platform] || alert.platform}
          </span>
          <a
            href={alert.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate max-w-xs"
          >
            <span className="truncate">{alert.video_title || alert.video_url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>

        {/* Detail */}
        <p className="text-xs text-muted-foreground mb-3">{alert.detail}</p>

        {/* Action hint */}
        <div className={`rounded-lg ${sev.bg} border ${sev.border} px-3 py-2`}>
          <p className={`text-xs ${sev.color}`}>
            <span className="font-semibold">Was tun? </span>
            {ACTION_HINT[alert.type]}
          </p>
        </div>

        {/* CTA for proof-related alerts */}
        {(alert.type === "discrepancy_critical" || alert.type === "proof_overdue") && (
          <div className="mt-3">
            <Link
              href={`/videos?highlight=${alert.video_id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Eye className="h-3.5 w-3.5" />
              Nachweis hochladen
            </Link>
          </div>
        )}
        {alert.type === "sync_stale" && (
          <div className="mt-3">
            <Link
              href="/accounts"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Konten prüfen
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "open,acknowledged,in_review", label: "Aktiv" },
  { key: "resolved,dismissed",          label: "Archiviert" },
  { key: "open,acknowledged,in_review,resolved,dismissed", label: "Alle" },
];

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("open,acknowledged,in_review");

  function load(filter: string) {
    setLoading(true);
    fetch(`/api/alerts?status=${encodeURIComponent(filter)}`)
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setAlerts(data.alerts);
          setCounts(data.counts);
        }
        setLoading(false);
      });
  }

  useEffect(() => { load(activeFilter); }, []);

  function switchFilter(f: string) {
    setActiveFilter(f);
    load(f);
  }

  const activeCount = (counts.open ?? 0) + (counts.acknowledged ?? 0) + (counts.in_review ?? 0);
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  // Group by severity for display
  const critical = alerts.filter((a) => a.severity === "critical");
  const high     = alerts.filter((a) => a.severity === "high");
  const medium   = alerts.filter((a) => a.severity === "medium");
  const low      = alerts.filter((a) => a.severity === "low");

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-3xl p-6">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
              {activeCount > 0 && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  criticalCount > 0
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                }`}>
                  {activeCount} aktiv{criticalCount > 0 ? ` · ${criticalCount} kritisch` : ""}
                </span>
              )}
            </div>
            <button
              onClick={() => load(activeFilter)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Aktualisieren
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Meldungen zu deinen Videos — Diskrepanzen, fehlende Belege, Sync-Probleme.
          </p>
        </div>

        {/* Status summary pills */}
        {(counts.open > 0 || counts.acknowledged > 0 || counts.in_review > 0 || counts.resolved > 0) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {counts.open         > 0 && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs text-red-400 border border-red-500/20">{counts.open} offen</span>}
            {counts.acknowledged > 0 && <span className="rounded-full bg-yellow-500/10 px-2.5 py-1 text-xs text-yellow-400 border border-yellow-500/20">{counts.acknowledged} bestätigt</span>}
            {counts.in_review    > 0 && <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400 border border-blue-500/20">{counts.in_review} in Prüfung</span>}
            {counts.resolved     > 0 && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400 border border-emerald-500/20">{counts.resolved} gelöst</span>}
          </div>
        )}

        {/* Filter tabs */}
        <div className="mb-5 flex gap-1 rounded-xl border border-border bg-card p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => switchFilter(f.key)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="h-1 w-full bg-muted animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="skeleton h-3 w-32" />
                  <div className="skeleton h-4 w-56" />
                  <div className="skeleton h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="text-base font-semibold mb-1">
              {activeFilter.includes("resolved") && !activeFilter.includes("open")
                ? "Keine archivierten Alerts"
                : "Alles in Ordnung"}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {activeFilter.includes("resolved") && !activeFilter.includes("open")
                ? "Noch keine gelösten oder geschlossenen Alerts."
                : "Du hast aktuell keine offenen Alerts. Gut gemacht!"}
            </p>
            {!activeFilter.includes("open") && (
              <button
                onClick={() => switchFilter("open,acknowledged,in_review")}
                className="mt-4 flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Inbox className="h-4 w-4" />
                Aktive Alerts anzeigen
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {critical.length > 0 && (
              <>
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Kritisch</p>
                {critical.map((a) => <AlertCard key={a.id} alert={a} />)}
              </>
            )}
            {high.length > 0 && (
              <>
                <p className={`text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2 ${critical.length > 0 ? "mt-5" : ""}`}>Hoch</p>
                {high.map((a) => <AlertCard key={a.id} alert={a} />)}
              </>
            )}
            {medium.length > 0 && (
              <>
                <p className={`text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2 ${(critical.length + high.length) > 0 ? "mt-5" : ""}`}>Mittel</p>
                {medium.map((a) => <AlertCard key={a.id} alert={a} />)}
              </>
            )}
            {low.length > 0 && (
              <>
                <p className={`text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 ${(critical.length + high.length + medium.length) > 0 ? "mt-5" : ""}`}>Niedrig</p>
                {low.map((a) => <AlertCard key={a.id} alert={a} />)}
              </>
            )}
          </div>
        )}

      </main>
    </>
  );
}
