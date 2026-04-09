"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { RefreshCw, CheckCircle2, XCircle, ExternalLink, MessageSquare } from "lucide-react";

interface PendingProof {
  id: string;
  title: string | null;
  url: string;
  platform: string;
  proof_url: string;
  proof_uploaded_at: string;
  proof_status: string;
  proof_cutter_note: string | null;
  claimed_views: number | null;
  current_views: number;
  observed_views: number | null;
  api_views: number | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  cutter_name: string;
  cutter_id: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400",
  tiktok: "bg-cyan-500/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-400",
  facebook: "bg-blue-500/10 text-blue-400",
};

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-DE").format(n);
}

// ── Single proof card ─────────────────────────────────────────
function ProofCard({
  proof,
  onAction,
  acting,
}: {
  proof: PendingProof;
  onAction: (id: string, action: "approve" | "reject" | "request_proof", extra?: { rejectionReason?: string; notes?: string }) => Promise<void>;
  acting: string | null;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notes, setNotes] = useState("");

  const isBusy = acting === proof.id;

  async function approve() {
    await onAction(proof.id, "approve");
  }

  async function reject() {
    if (!rejectionReason.trim()) return;
    await onAction(proof.id, "reject", { rejectionReason: rejectionReason.trim(), notes: notes.trim() || undefined });
    setRejectOpen(false);
    setRejectionReason("");
    setNotes("");
  }

  async function requestProof() {
    await onAction(proof.id, "request_proof", { notes: notes.trim() || undefined });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[proof.platform] ?? "bg-muted"}`}
            >
              {PLATFORM_LABELS[proof.platform] ?? proof.platform}
            </span>
            <span className="font-medium truncate">
              {proof.title || "Ohne Titel"}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground/80">{proof.cutter_name}</p>
          <a
            href={proof.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-0.5"
          >
            {proof.url}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <p>Eingereicht: {new Date(proof.proof_uploaded_at).toLocaleString("de-DE", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}</p>
        </div>
      </div>

      {/* Cutter note */}
      {proof.proof_cutter_note && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm text-blue-300">
          <MessageSquare className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
          <span>{proof.proof_cutter_note}</span>
        </div>
      )}

      {/* View stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Angegeben (Klipper)</p>
          <p className="font-semibold">{formatNum(proof.claimed_views)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Beobachtet (Scraper)</p>
          <p className="font-semibold">{formatNum(proof.observed_views ?? proof.current_views)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Offizielle API</p>
          <p className="font-semibold">{formatNum(proof.api_views)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Konfidenz</p>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${proof.confidence_level ?? 0}%` }}
              />
            </div>
            <span className="font-semibold text-xs">{proof.confidence_level ?? 0}%</span>
          </div>
        </div>
      </div>

      {/* Discrepancy badge */}
      {proof.discrepancy_status && proof.discrepancy_status !== "cannot_verify" && (
        <div className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
          proof.discrepancy_status === "match" ? "bg-emerald-500/10 text-emerald-400" :
          proof.discrepancy_status === "minor_difference" ? "bg-yellow-500/10 text-yellow-400" :
          proof.discrepancy_status === "suspicious_difference" ? "bg-orange-500/10 text-orange-400" :
          "bg-red-500/10 text-red-400"
        }`}>
          {proof.discrepancy_status === "match" && "✓ Übereinstimmung"}
          {proof.discrepancy_status === "minor_difference" && `~ Kleine Abweichung (${proof.discrepancy_percent}%)`}
          {proof.discrepancy_status === "suspicious_difference" && `⚠ Verdächtig (${proof.discrepancy_percent}%)`}
          {proof.discrepancy_status === "critical_difference" && `✕ Kritisch (${proof.discrepancy_percent}%)`}
          {" "}· Quelle: {proof.verification_source ?? "—"}
        </div>
      )}

      {/* Proof image */}
      <div className="rounded-lg border border-border overflow-hidden">
        <a href={proof.proof_url} target="_blank" rel="noopener noreferrer">
          <img
            src={proof.proof_url}
            alt="Nachweis"
            className="max-h-56 w-full object-contain rounded hover:opacity-90 transition-opacity"
          />
        </a>
      </div>

      {/* Reject form (expandable) */}
      {rejectOpen && (
        <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <label className="block text-xs font-medium text-red-400">Ablehnungsgrund *</label>
          <input
            type="text"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="z.B. Screenshot unlesbar, falsche Views sichtbar…"
            className="w-full rounded-lg border border-red-500/30 bg-background px-3 py-1.5 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/20"
          />
          <label className="block text-xs font-medium text-muted-foreground mt-2">Interner Hinweis (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Zusätzliche Notizen für das Team…"
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary resize-none"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={reject}
              disabled={isBusy || !rejectionReason.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
            >
              {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Ablehnen bestätigen
            </button>
            <button
              onClick={() => { setRejectOpen(false); setRejectionReason(""); setNotes(""); }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!rejectOpen && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={approve}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            Genehmigen
          </button>
          <button
            onClick={() => setRejectOpen(true)}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            <XCircle className="h-4 w-4" />
            Ablehnen
          </button>
          <button
            onClick={requestProof}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            title="Neuen Beleg anfordern"
          >
            <MessageSquare className="h-4 w-4" />
            Beleg erneut anfordern
          </button>
          {isBusy && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function OpsVerificationPage() {
  const router = useRouter();
  const [proofs, setProofs] = useState<PendingProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/ops/verification");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const json = await res.json();
    setProofs(json.proofs ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAction(
    videoId: string,
    action: "approve" | "reject" | "request_proof",
    extra?: { rejectionReason?: string; notes?: string }
  ) {
    setActing(videoId);
    await fetch("/api/ops/verification", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, action, ...extra }),
    });
    await load();
    setActing(null);
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Proof Review Queue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ausstehende Nachweise prüfen und genehmigen
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!loading && proofs.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {proofs.length} ausstehend
              </span>
            )}
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Lade Nachweise…
          </div>
        ) : proofs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-2xl mb-2">✓</p>
            <p className="font-medium">Alles geprüft</p>
            <p className="text-sm text-muted-foreground mt-1">Keine ausstehenden Nachweise</p>
          </div>
        ) : (
          <div className="space-y-4">
            {proofs.map((proof) => (
              <ProofCard
                key={proof.id}
                proof={proof}
                onAction={handleAction}
                acting={acting}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
