"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import {
  ShieldAlert,
  Users,
  Video,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  RefreshCw,
  ClipboardList,
} from "lucide-react";

interface AlertRow {
  id: string;
  cutter_id: string;
  video_id: string | null;
  alert_type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  cutter_name: string;
  video_url: string | null;
  video_platform: string | null;
}

interface CutterRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: number;
  video_count: number;
  flagged_count: number;
  verified_count: number;
  score?: number;
}

interface AuditRow {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: string | null;
  created_at: string;
}

interface VideoStats {
  total: number;
  verified: number;
  suspicious: number;
  critical: number;
  matched: number;
}

interface OpsData {
  alerts: AlertRow[];
  cutters: CutterRow[];
  stats: VideoStats;
  auditLog: AuditRow[];
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Kritisch",
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const ACTION_LABELS: Record<string, string> = {
  video_submit: "Video eingereicht",
  video_delete: "Video gelöscht",
  invoice_generate: "Rechnung erstellt",
  invoice_sent: "Rechnung versendet",
  invoice_paid: "Rechnung bezahlt",
  cutter_deactivate: "Cutter deaktiviert",
  cutter_reactivate: "Cutter reaktiviert",
  cutter_create: "Cutter angelegt",
  alert_resolve: "Alert gelöst",
  alert_dismiss: "Alert verworfen",
};

const ACTION_COLORS: Record<string, string> = {
  video_submit: "text-blue-400",
  invoice_generate: "text-emerald-400",
  invoice_sent: "text-emerald-400",
  invoice_paid: "text-emerald-400",
  cutter_deactivate: "text-red-400",
  cutter_reactivate: "text-emerald-400",
  cutter_create: "text-blue-400",
  alert_resolve: "text-emerald-400",
  alert_dismiss: "text-yellow-400",
};

function formatNum(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("de-DE").format(n);
}

type Tab = "alerts" | "cutters" | "audit";

export default function OpsPage() {
  const router = useRouter();
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("alerts");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/ops");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function resolveAlert(alertId: string, status: "resolved" | "dismissed") {
    setResolving(alertId);
    await fetch("/api/ops", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId, status }),
    });
    await load();
    setResolving(null);
  }

  if (loading) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-6xl p-6">
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Lade Ops-Daten…
          </div>
        </main>
      </>
    );
  }

  const { alerts, cutters, stats, auditLog } = data!;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ops Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Verifikation, Alerts &amp; Audit Log
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            icon={<Video className="h-5 w-5" />}
            label="Videos gesamt"
            value={formatNum(stats.total)}
          />
          <KpiCard
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            label="Verifiziert"
            value={formatNum(stats.verified)}
            accent="emerald"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5 text-yellow-400" />}
            label="Verdächtig"
            value={formatNum(stats.suspicious)}
            accent="yellow"
          />
          <KpiCard
            icon={<XCircle className="h-5 w-5 text-red-400" />}
            label="Kritisch"
            value={formatNum(stats.critical)}
            accent="red"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          <TabButton active={tab === "alerts"} onClick={() => setTab("alerts")}>
            <ShieldAlert className="h-4 w-4" />
            Alerts
            {alerts.length > 0 && (
              <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400 font-medium">
                {alerts.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "cutters"} onClick={() => setTab("cutters")}>
            <Users className="h-4 w-4" />
            Cutter
          </TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
            <ClipboardList className="h-4 w-4" />
            Audit Log
          </TabButton>
        </div>

        {/* Tab: Alerts */}
        {tab === "alerts" && (
          <section>
            {alerts.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
                Keine offenen Alerts — alles grün.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[alert.severity] ?? ""}`}
                        >
                          {SEVERITY_LABELS[alert.severity] ?? alert.severity}
                        </span>
                        <span className="text-sm font-medium truncate">{alert.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {alert.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">{alert.cutter_name}</span>
                        {alert.video_platform && (
                          <span>{PLATFORM_LABELS[alert.video_platform] ?? alert.video_platform}</span>
                        )}
                        {alert.video_url && (
                          <a
                            href={alert.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 hover:text-foreground"
                          >
                            Video <ChevronRight className="h-3 w-3" />
                          </a>
                        )}
                        <span>{new Date(alert.created_at).toLocaleDateString("de-DE")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => resolveAlert(alert.id, "resolved")}
                        disabled={resolving === alert.id}
                        className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        Lösen
                      </button>
                      <button
                        onClick={() => resolveAlert(alert.id, "dismissed")}
                        disabled={resolving === alert.id}
                        className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
                      >
                        Verwerfen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Tab: Cutters */}
        {tab === "cutters" && (
          <section>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Rolle</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Videos</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Verifiziert</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Flagged</th>
                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Score</th>
                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cutters.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {c.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{formatNum(c.video_count)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{formatNum(c.verified_count)}</td>
                      <td className="px-4 py-3 text-right">
                        {c.flagged_count > 0 ? (
                          <span className="font-medium text-red-400">{formatNum(c.flagged_count)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.score !== undefined ? (
                          <span
                            className={`font-semibold ${
                              c.score >= 80
                                ? "text-emerald-400"
                                : c.score >= 50
                                ? "text-yellow-400"
                                : "text-red-400"
                            }`}
                          >
                            {c.score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.is_active ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">Aktiv</span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inaktiv</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cutters.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Keine Cutter gefunden.
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tab: Audit Log */}
        {tab === "audit" && (
          <section>
            {auditLog.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
                Noch keine Audit-Einträge vorhanden.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {auditLog.map((entry) => {
                  let metaObj: Record<string, unknown> = {};
                  try { metaObj = entry.meta ? JSON.parse(entry.meta) : {}; } catch { /* ignore */ }

                  return (
                    <div key={entry.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${ACTION_COLORS[entry.action] ?? "text-foreground"}`}>
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            von <span className="font-medium text-foreground/70">{entry.actor_name}</span>
                          </span>
                        </div>
                        {Object.keys(metaObj).length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {Object.entries(metaObj)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString("de-DE", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "emerald" | "yellow" | "red";
}) {
  const borderColor =
    accent === "emerald" ? "border-emerald-500/20" :
    accent === "yellow" ? "border-yellow-500/20" :
    accent === "red" ? "border-red-500/20" :
    "border-border";

  return (
    <div className={`rounded-xl border ${borderColor} bg-card p-4`}>
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
