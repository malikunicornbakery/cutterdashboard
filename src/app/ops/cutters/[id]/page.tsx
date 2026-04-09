"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ArrowLeft,
  RefreshCw,
  Flag,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  User,
} from "lucide-react";

interface CutterProfile {
  id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  is_active: number | null;
  rate_per_view: number | null;
  monthly_clip_minimum: number | null;
  created_at: string | null;
  reliability_score: number;
  total_videos: number;
  verified_count: number;
  suspicious_count: number;
  critical_count: number;
}

interface Clip {
  id: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  current_views: number | null;
  claimed_views: number | null;
  verification_status: string | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number;
  last_scraped_at: string | null;
  created_at: string | null;
  episode_title: string | null;
}

interface PlatformBreakdown {
  platform: string | null;
  count: number;
  total_views: number;
  verified_count: number;
}

interface AuditEntry {
  actor_name: string | null;
  action: string | null;
  entity_id: string | null;
  meta: string | null;
  created_at: string | null;
}

interface CutterProfileResponse {
  cutter: CutterProfile;
  clips: Clip[];
  platforms: PlatformBreakdown[];
  auditTrail: AuditEntry[];
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verifiziert", cls: "bg-emerald-500/10 text-emerald-400" },
  partially_verified: { label: "Teilweise", cls: "bg-yellow-500/10 text-yellow-400" },
  unverified: { label: "Ausstehend", cls: "bg-muted/50 text-muted-foreground" },
  claimed_only: { label: "Nur Angabe", cls: "bg-orange-500/10 text-orange-400" },
  manual_proof: { label: "Beleg", cls: "bg-blue-500/10 text-blue-400" },
  unavailable: { label: "—", cls: "bg-muted/50 text-muted-foreground" },
};

const DISC_LABELS: Record<string, { label: string; cls: string }> = {
  match: { label: "Match", cls: "text-emerald-400" },
  minor_difference: { label: "Gering", cls: "text-yellow-400" },
  suspicious_difference: { label: "Verdächtig", cls: "text-orange-400" },
  critical_difference: { label: "Kritisch", cls: "text-red-400" },
  no_data: { label: "—", cls: "text-muted-foreground" },
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube: "YT",
  tiktok: "TK",
  instagram: "IG",
  facebook: "FB",
};

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

export default function CutterProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<CutterProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/cutters/${id}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    if (res.status === 404) { router.push("/ops/clips"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <div className="skeleton h-4 w-24" />
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="skeleton h-14 w-14 rounded-full" />
              <div className="space-y-2 flex-1">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-4 w-56" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-7 w-12" />
              </div>
            ))}
          </div>
        </main>
      </>
    );
  }

  if (!data) return null;

  const { cutter, clips, platforms, auditTrail } = data;
  const verifiedPct = cutter.total_videos > 0
    ? Math.round((cutter.verified_count / cutter.total_videos) * 100)
    : 0;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Back */}
        <Link
          href="/ops/clips"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Clips
        </Link>

        {/* Header */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
              {cutter.name ? getInitials(cutter.name) : <User className="h-6 w-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold">{cutter.name ?? "Unbekannt"}</h1>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  cutter.role === "super_admin"
                    ? "bg-primary/15 text-primary"
                    : cutter.role === "ops_manager"
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {cutter.role === "super_admin" ? "Admin"
                    : cutter.role === "ops_manager" ? "Ops Manager"
                    : "Cutter"}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  cutter.is_active
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}>
                  {cutter.is_active ? "Aktiv" : "Inaktiv"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{cutter.email ?? "—"}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                {cutter.rate_per_view != null && (
                  <span>Rate: {cutter.rate_per_view.toFixed(4)} €/View</span>
                )}
                {cutter.monthly_clip_minimum != null && (
                  <span>Min. Clips/Monat: {cutter.monthly_clip_minimum}</span>
                )}
                {cutter.created_at && (
                  <span>Seit: {formatDateTime(cutter.created_at)}</span>
                )}
              </div>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-primary/20 bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Zuverlässigkeit</p>
            <p className={`text-3xl font-bold ${scoreColor(cutter.reliability_score)}`}>
              {cutter.reliability_score}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">von 100</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{cutter.total_videos}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clips gesamt</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-card p-4">
            <div className="mb-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{verifiedPct}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Verifiziert</p>
          </div>
          <div className="rounded-xl border border-orange-500/20 bg-card p-4">
            <div className="mb-2 text-orange-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{(cutter.suspicious_count ?? 0) + (cutter.critical_count ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Verdächtig / Kritisch</p>
          </div>
        </div>

        {/* Reliability bar */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Zuverlässigkeits-Score</span>
            <span className={`font-bold ${scoreColor(cutter.reliability_score)}`}>
              {cutter.reliability_score}/100
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColor(cutter.reliability_score)}`}
              style={{ width: `${cutter.reliability_score}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="text-emerald-400">{cutter.verified_count} verifiziert</span>
            <span className="text-orange-400">{cutter.suspicious_count ?? 0} verdächtig</span>
            <span className="text-red-400">{cutter.critical_count ?? 0} kritisch</span>
          </div>
        </div>

        {/* Platform breakdown */}
        {platforms.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold text-sm">Plattform-Übersicht</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {platforms.map((p) => (
                <div key={p.platform} className="rounded-lg border border-border bg-muted/10 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-bold">
                      {PLATFORM_ICONS[p.platform ?? ""] ?? (p.platform ?? "?").toUpperCase().slice(0, 2)}
                    </span>
                    <span className="text-xs font-medium">
                      {PLATFORM_LABELS[p.platform ?? ""] ?? p.platform ?? "—"}
                    </span>
                  </div>
                  <p className="text-lg font-bold">{formatNum(p.total_views)}</p>
                  <div className="text-xs text-muted-foreground">
                    <span>{p.count} Clips</span>
                    <span className="mx-1">·</span>
                    <span className="text-emerald-400">{p.verified_count} verif.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clips table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">Alle Clips ({clips.length})</h2>
          </div>
          {clips.length === 0 ? (
            <div className="px-5 py-12 text-center text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Clips vorhanden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Episode</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Plattform</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground max-w-48">Clip</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Views</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Angabe</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Disc.%</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Sync</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clips.map((clip) => {
                    const isCritical = clip.discrepancy_status === "critical_difference";
                    const isSuspicious = clip.discrepancy_status === "suspicious_difference";
                    const rowCls = isCritical
                      ? "border-l-2 border-red-500 hover:bg-muted/30"
                      : isSuspicious
                      ? "border-l-2 border-amber-500 hover:bg-muted/30"
                      : "hover:bg-muted/30";
                    const statusCfg = STATUS_CONFIG[clip.verification_status ?? ""] ?? STATUS_CONFIG.unavailable;
                    const discCfg = DISC_LABELS[clip.discrepancy_status ?? ""] ?? DISC_LABELS.no_data;

                    return (
                      <tr key={clip.id} className={rowCls}>
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-32 truncate">
                          {clip.episode_title ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {PLATFORM_LABELS[clip.platform ?? ""] ?? clip.platform ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-48">
                          {clip.url ? (
                            <a
                              href={clip.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 truncate text-xs hover:text-primary"
                              title={clip.title ?? ""}
                            >
                              <span className="truncate">{clip.title ?? clip.url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground truncate block" title={clip.title ?? ""}>
                              {clip.title ?? "—"}
                            </span>
                          )}
                          {clip.is_flagged ? (
                            <span className="text-xs text-red-400 flex items-center gap-0.5 mt-0.5">
                              <Flag className="h-3 w-3" /> Geflaggt
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">
                          {formatNum(clip.current_views)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">
                          {formatNum(clip.claimed_views)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs">
                          {clip.discrepancy_percent != null ? (
                            <span className={discCfg.cls}>
                              {clip.discrepancy_percent > 0 ? "+" : ""}
                              {clip.discrepancy_percent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelative(clip.last_scraped_at)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Link
                            href={`/ops/clips/${clip.id}`}
                            className="rounded bg-muted px-2 py-1 text-xs hover:bg-accent transition-colors whitespace-nowrap"
                          >
                            Detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit trail */}
        {auditTrail.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">Letzte Aktivitäten</h2>
            </div>
            <div className="divide-y divide-border">
              {auditTrail.map((entry, i) => {
                let metaObj: Record<string, unknown> = {};
                try { metaObj = entry.meta ? JSON.parse(entry.meta) : {}; } catch { /* ignore */ }
                const metaKeys = Object.keys(metaObj).filter(k => metaObj[k] != null && metaObj[k] !== "");

                return (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground mt-0.5">
                      {(entry.actor_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{entry.actor_name ?? "Unbekannt"}</span>
                        {" · "}
                        <span className="text-muted-foreground">{entry.action ?? "Aktion"}</span>
                      </p>
                      {metaKeys.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {metaKeys.map(k => `${k}: ${metaObj[k]}`).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelative(entry.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
