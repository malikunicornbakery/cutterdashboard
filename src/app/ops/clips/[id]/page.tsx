"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { ClipNotesPanel } from "@/components/clip-notes-panel";
import {
  ArrowLeft,
  Flag,
  FlagOff,
  CheckCircle2,
  ShieldCheck,
  FileText,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface VideoDetail {
  id: string;
  cutter_id: string;
  platform: string | null;
  external_id: string | null;
  url: string | null;
  title: string | null;
  account_handle: string | null;
  current_views: number | null;
  views_at_last_invoice: number | null;
  claimed_views: number | null;
  observed_views: number | null;
  api_views: number | null;
  verification_status: string | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number | null;
  flag_reason: string | null;
  proof_url: string | null;
  proof_status: string | null;
  proof_notes: string | null;
  episode_id: string | null;
  published_at: string | null;
  last_scraped_at: string | null;
  created_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

interface Cutter {
  id: string | null;
  name: string | null;
  email: string | null;
  rate_per_view: number | null;
}

interface Episode {
  id: string | null;
  title: string | null;
}

interface Snapshot {
  id: string | null;
  views: number | null;
  observed_views: number | null;
  api_views: number | null;
  claimed_views: number | null;
  verification_source: string | null;
  confidence_level: number | null;
  snapshot_type: string | null;
  success: number | null;
  error_message: string | null;
  scraped_at: string | null;
}

interface AuditEntry {
  id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  meta: string | null;
  created_at: string | null;
}

interface ClipDetailResponse {
  video: VideoDetail;
  cutter: Cutter | null;
  episode: Episode | null;
  snapshots: Snapshot[];
  auditTrail: AuditEntry[];
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const DISC_CONFIG: Record<string, { label: string; cls: string }> = {
  match: { label: "Übereinstimmung", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  minor_difference: { label: "Geringe Differenz", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  suspicious_difference: { label: "Verdächtige Differenz", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  critical_difference: { label: "Kritische Differenz", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  no_data: { label: "Keine Daten", cls: "bg-muted/50 text-muted-foreground border-border" },
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

const ACTION_LABELS: Record<string, string> = {
  "video.mark_reviewed":  "Als geprüft markiert",
  "video.flag":           "Geflaggt",
  "video.unflag":         "Entflaggt",
  "video.approve_proof":  "Beleg genehmigt",
  "video.reject_proof":   "Beleg abgelehnt",
  "video.request_proof":  "Beleg angefordert",
  "video.add_note":       "Notiz hinzugefügt",
  "video.set_verified":   "Als verifiziert gesetzt",
  "proof_approve":        "Beleg genehmigt",
  "proof_reject":         "Beleg abgelehnt",
  "note_add":             "Cutter-sichtbare Notiz hinzugefügt",
  "note_delete":          "Notiz gelöscht",
};

export default function ClipDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<ClipDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showFlagInput, setShowFlagInput] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/clips/${id}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    if (res.status === 404) { router.push("/ops/clips"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, extra: Record<string, unknown> = {}) {
    setActionLoading(action);
    await fetch(`/api/ops/clips/${id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    await load();
    setActionLoading(null);
  }

  if (loading) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-4xl p-6">
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Lade Clip-Details…
          </div>
        </main>
      </>
    );
  }

  if (!data) return null;

  const { video, cutter, episode, snapshots, auditTrail } = data;
  const discCfg = DISC_CONFIG[video.discrepancy_status ?? ""] ?? DISC_CONFIG.no_data;
  const isFlagged = !!video.is_flagged;
  const confidencePct = video.confidence_level ?? 0;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl p-6 space-y-6">
        {/* Back */}
        <Link
          href="/ops/clips"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Clips
        </Link>

        {/* Header card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                  {PLATFORM_LABELS[video.platform ?? ""] ?? video.platform ?? "Unbekannt"}
                </span>
                {isFlagged && (
                  <span className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                    <Flag className="h-3 w-3" /> Geflaggt
                  </span>
                )}
                {video.proof_status === "pending" && (
                  <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400">
                    Beleg ausstehend
                  </span>
                )}
              </div>
              <h1 className="text-lg font-bold leading-tight">
                {video.title ?? "Kein Titel"}
              </h1>
              {video.url && (
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1"
                >
                  {video.url.length > 60 ? video.url.slice(0, 60) + "…" : video.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="text-right shrink-0 text-xs text-muted-foreground space-y-1">
              {video.published_at && <p>Veröffentlicht: {formatDateTime(video.published_at)}</p>}
              {video.last_scraped_at && <p>Letzter Sync: {formatRelative(video.last_scraped_at)}</p>}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-muted-foreground">
              Cutter:{" "}
              <Link
                href={`/ops/clips?cutter=${video.cutter_id}`}
                className="font-medium text-foreground hover:text-primary"
              >
                {cutter?.name ?? "—"}
              </Link>
            </span>
            {episode && (
              <span className="text-muted-foreground">
                Episode: <span className="font-medium text-foreground">{episode.title}</span>
              </span>
            )}
            {video.account_handle && (
              <span className="text-muted-foreground">
                Handle: <span className="font-medium text-foreground">{video.account_handle}</span>
              </span>
            )}
          </div>

          {isFlagged && video.flag_reason && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              Flag-Grund: {video.flag_reason}
            </div>
          )}
        </div>

        {/* View comparison */}
        <div className="grid grid-cols-3 gap-4">
          <ViewCard label="Angegeben" value={formatNum(video.claimed_views)} border="border-orange-500/40" source="Cutter-Angabe" />
          <ViewCard
            label="Beobachtet"
            value={formatNum(video.observed_views ?? video.current_views)}
            border="border-blue-500/40"
            source="Scraper"
          />
          <ViewCard label="API-Verifiziert" value={formatNum(video.api_views)} border="border-emerald-500/40" source="Plattform-API" />
        </div>

        {/* Confidence meter */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Konfidenz</span>
            <span className="text-muted-foreground">
              {confidencePct}/100 · {video.verification_source ?? "—"}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                confidencePct >= 80 ? "bg-emerald-500" :
                confidencePct >= 50 ? "bg-yellow-500" :
                "bg-red-500"
              }`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>

        {/* Discrepancy badge */}
        <div className={`rounded-xl border px-5 py-4 flex items-center justify-between ${discCfg.cls}`}>
          <div>
            <p className="text-xs font-medium opacity-70 mb-0.5">Diskrepanz-Status</p>
            <p className="text-lg font-bold">{discCfg.label}</p>
          </div>
          {video.discrepancy_percent != null && (
            <p className="text-3xl font-bold font-mono">
              {video.discrepancy_percent > 0 ? "+" : ""}
              {video.discrepancy_percent.toFixed(1)}%
            </p>
          )}
        </div>

        {/* Admin actions */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Admin-Aktionen</h2>

          <div className="flex flex-wrap gap-2">
            {/* Mark reviewed */}
            <button
              onClick={() => doAction("mark_reviewed")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Als geprüft markieren
              {video.reviewed_by && (
                <span className="ml-1 text-xs opacity-60">({video.reviewed_by})</span>
              )}
            </button>

            {/* Flag / Unflag */}
            {isFlagged ? (
              <button
                onClick={() => doAction("unflag")}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
              >
                <FlagOff className="h-4 w-4" />
                Entflaggen
              </button>
            ) : (
              <button
                onClick={() => setShowFlagInput(v => !v)}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                <Flag className="h-4 w-4" />
                Flaggen
              </button>
            )}

            {/* Request proof */}
            <button
              onClick={() => doAction("request_proof")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 disabled:opacity-50 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Beleg anfordern
            </button>

            {/* Set verified */}
            <button
              onClick={() => doAction("set_verified")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-sm text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
            >
              <ShieldCheck className="h-4 w-4" />
              Verifiziert setzen
            </button>
          </div>

          {/* Flag reason input */}
          {showFlagInput && !isFlagged && (
            <div className="flex gap-2">
              <input
                value={flagReason}
                onChange={e => setFlagReason(e.target.value)}
                placeholder="Grund für Flag…"
                className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={async () => {
                  await doAction("flag", { reason: flagReason });
                  setShowFlagInput(false);
                  setFlagReason("");
                }}
                disabled={!flagReason.trim() || actionLoading !== null}
                className="h-9 rounded-lg bg-red-500/10 px-4 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                Flaggen
              </button>
            </div>
          )}

        </div>

        {/* Internal notes panel */}
        <ClipNotesPanel videoId={id} />

        {/* Proof section */}
        {video.proof_url && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Beleg</h2>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                video.proof_status === "approved" ? "bg-emerald-500/10 text-emerald-400" :
                video.proof_status === "rejected" ? "bg-red-500/10 text-red-400" :
                video.proof_status === "pending" ? "bg-yellow-500/10 text-yellow-400" :
                "bg-muted text-muted-foreground"
              }`}>
                {video.proof_status === "approved" ? "Genehmigt" :
                 video.proof_status === "rejected" ? "Abgelehnt" :
                 video.proof_status === "pending" ? "Ausstehend" :
                 video.proof_status ?? "—"}
              </span>
            </div>

            <img
              src={video.proof_url}
              alt="Beleg"
              className="rounded-lg border border-border max-h-96 w-full object-contain bg-muted"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />

            {video.proof_notes && (
              <p className="text-xs text-muted-foreground">{video.proof_notes}</p>
            )}

            {video.proof_status === "pending" && (
              <div className="space-y-2">
                {showRejectInput && (
                  <div className="flex gap-2">
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Ablehnungsgrund…"
                      className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={async () => {
                        await doAction("reject_proof", { reason: rejectReason });
                        setShowRejectInput(false);
                        setRejectReason("");
                      }}
                      disabled={!rejectReason.trim() || actionLoading !== null}
                      className="h-9 rounded-lg bg-red-500/10 px-4 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Ablehnen
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => doAction("approve_proof")}
                    disabled={actionLoading !== null}
                    className="flex-1 rounded-lg bg-emerald-500/10 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                  >
                    Beleg genehmigen
                  </button>
                  <button
                    onClick={() => setShowRejectInput(v => !v)}
                    disabled={actionLoading !== null}
                    className="flex-1 rounded-lg bg-red-500/10 py-2 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                  >
                    Beleg ablehnen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Snapshot history */}
        {snapshots.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">Snapshot-Verlauf</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Datum</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Views</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Quelle</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Konfidenz</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Typ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {snapshots.map((snap, i) => (
                    <tr key={snap.id ?? i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(snap.scraped_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono">
                        {formatNum(snap.views ?? snap.api_views ?? snap.observed_views)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {snap.verification_source ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        {snap.confidence_level != null ? (
                          <span className={`font-medium ${
                            snap.confidence_level >= 80 ? "text-emerald-400" :
                            snap.confidence_level >= 50 ? "text-yellow-400" :
                            "text-red-400"
                          }`}>
                            {snap.confidence_level}/100
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {snap.snapshot_type ?? "—"}
                        {snap.success === 0 && snap.error_message && (
                          <span className="ml-1 text-red-400" title={snap.error_message}>(Fehler)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit trail */}
        {auditTrail.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">Audit-Verlauf</h2>
            </div>
            <div className="divide-y divide-border">
              {auditTrail.map((entry, i) => {
                let metaObj: Record<string, unknown> = {};
                try { metaObj = entry.meta ? JSON.parse(entry.meta) : {}; } catch { /* ignore */ }
                const metaKeys = Object.keys(metaObj).filter(k => metaObj[k] !== null && metaObj[k] !== undefined && metaObj[k] !== "");

                return (
                  <div key={entry.id ?? i} className="flex items-start gap-3 px-5 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground mt-0.5">
                      {(entry.actor_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{entry.actor_name ?? "Unbekannt"}</span>
                        {" "}
                        <span className="text-muted-foreground">
                          {ACTION_LABELS[entry.action ?? ""] ?? entry.action ?? "Aktion"}
                        </span>
                      </p>
                      {metaKeys.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {metaKeys.map(k => `${k}: ${metaObj[k]}`).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
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

function ViewCard({
  label,
  value,
  border,
  source,
}: {
  label: string;
  value: string;
  border: string;
  source: string;
}) {
  return (
    <div className={`rounded-xl border-2 ${border} bg-card p-4 space-y-1`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
      <p className="text-xs text-muted-foreground">{source}</p>
    </div>
  );
}
