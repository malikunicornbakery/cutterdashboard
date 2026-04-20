"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Plus, Trash2, ExternalLink, RefreshCw, Pencil, Check, X, Upload, Video, Eye,
} from "lucide-react";

interface VideoRow {
  id: string;
  platform: string;
  external_id: string;
  url: string;
  title: string | null;
  account_handle: string | null;
  current_views: number;
  claimed_views: number | null;
  views_at_last_invoice: number;
  unbilled_views: number;
  verification_status: string | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  last_scraped_at: string | null;
  created_at: string;
  proof_url: string | null;
  proof_status: string | null;
  proof_uploaded_at?: string | null;
  proof_rejection_reason?: string | null;
  proof_cutter_note?: string | null;
  proof_requested_at?: string | null;
  episode_id: string | null;
  is_flagged?: boolean;
}

type ClipStatus =
  | "submitted"
  | "syncing"
  | "verified"
  | "partially_verified"
  | "manual_proof_required"
  | "under_review"
  | "rejected";

function getClipStatus(v: VideoRow): ClipStatus {
  if (v.is_flagged) return "rejected";
  if (v.proof_status === "proof_submitted" || v.proof_status === "proof_under_review") return "under_review";
  if (
    v.discrepancy_status === "critical_difference" ||
    v.discrepancy_status === "suspicious_difference" ||
    v.proof_status === "proof_requested"
  ) {
    if (!v.proof_url || v.proof_status === "proof_requested") return "manual_proof_required";
  }
  if (v.verification_status === "verified" || v.proof_status === "proof_approved") return "verified";
  if (v.verification_status === "partially_verified") return "partially_verified";
  if (!v.last_scraped_at) return "submitted";
  return "syncing";
}

const STATUS_CONFIG: Record<ClipStatus, { label: string; className: string }> = {
  submitted:             { label: "Eingereicht",  className: "bg-muted/50 text-muted-foreground border border-border" },
  syncing:               { label: "⟳ Syncing",    className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  verified:              { label: "✓ Verifiziert", className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  partially_verified:    { label: "~ Teilweise",   className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  manual_proof_required: { label: "⚠ Beleg nötig", className: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  under_review:          { label: "In Prüfung",    className: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
  rejected:              { label: "✕ Abgelehnt",   className: "bg-red-500/10 text-red-400 border border-red-500/20" },
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 2) return "gerade eben";
  if (mins < 60) return `vor ${mins}m`;
  if (hours < 24) return `vor ${hours}h`;
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days}T`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400 border border-red-500/20",
  tiktok: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  instagram: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  facebook: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

const VERIFICATION_CONFIG: Record<string, { label: string; className: string }> = {
  verified:           { label: "✓ Verifiziert",    className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  partially_verified: { label: "~ Teilweise",       className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  claimed_only:       { label: "Nur Angabe",         className: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  manual_proof:       { label: "Beleg",              className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  unavailable:        { label: "Nicht verfügbar",    className: "bg-muted/50 text-muted-foreground border border-border" },
  unverified:         { label: "Ausstehend",         className: "bg-muted/50 text-muted-foreground border border-border" },
};

const DISCREPANCY_CONFIG: Record<string, { label: string; className: string }> = {
  match:                 { label: "Übereinstimmung",  className: "bg-emerald-500/10 text-emerald-400" },
  minor_difference:      { label: "Kleine Abw.",      className: "bg-yellow-500/10 text-yellow-400" },
  suspicious_difference: { label: "⚠ Verdächtig",    className: "bg-orange-500/10 text-orange-400" },
  critical_difference:   { label: "⚠ Kritisch",      className: "bg-red-500/10 text-red-400" },
  cannot_verify:         { label: "Nicht prüfbar",    className: "bg-muted/50 text-muted-foreground" },
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

// ── Skeleton ─────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="grid grid-cols-8 gap-4">
          {["Video", "Plattform", "Views", "Gemeldet", "Clip-Status", "Zuletzt sync", "Nachweis", ""].map((h) => (
            <div key={h} className="skeleton h-3 w-16" />
          ))}
        </div>
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="border-b border-border px-4 py-4 last:border-0">
          <div className="grid grid-cols-8 gap-4 items-center">
            <div>
              <div className="skeleton h-4 w-40 mb-1.5" />
              <div className="skeleton h-3 w-28" />
            </div>
            <div className="skeleton h-5 w-16 rounded-md" />
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-5 w-20 rounded-md" />
            <div className="skeleton h-4 w-14" />
            <div className="skeleton h-6 w-16 rounded-md" />
            <div className="skeleton h-5 w-5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────
function VerificationBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cfg = VERIFICATION_CONFIG[status] ?? VERIFICATION_CONFIG.unverified;
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function DiscrepancyBadge({ status, percent }: { status: string | null; percent: number | null }) {
  if (!status || status === "cannot_verify") return null;
  const cfg = DISCREPANCY_CONFIG[status] ?? DISCREPANCY_CONFIG.cannot_verify;
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}{percent !== null ? ` ${percent}%` : ""}
    </span>
  );
}

// ── Claimed Views Cell ────────────────────────────────────────
function ClaimedViewsCell({ video, onUpdate, mobile }: { video: VideoRow; onUpdate: (id: string, val: number | null) => void; mobile?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(video.claimed_views?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErrorMsg(null);
    const parsed = value.trim() === "" ? null : parseInt(value, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      setSaving(false);
      setErrorMsg("Bitte eine gültige Zahl eingeben.");
      return;
    }
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimed_views: parsed }),
    });
    setSaving(false);
    if (res.ok) {
      onUpdate(video.id, parsed);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error || `Fehler (${res.status})`);
    }
  }

  if (mobile) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(e) => { setValue(e.target.value); setSaved(false); setErrorMsg(null); }}
            placeholder="Views eingeben…"
            className={`flex-1 h-11 rounded-xl border px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background transition-colors ${
              errorMsg ? "border-red-500 focus:border-red-500" : saved ? "border-emerald-500 focus:border-emerald-500" : "border-border focus:border-primary"
            }`}
          />
          <button
            onClick={save}
            disabled={saving}
            className={`h-11 px-5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
            }`}
          >
            {saving ? "…" : saved ? "✓" : "OK"}
          </button>
        </div>
        {saved && <p className="text-xs text-emerald-400 font-medium">✓ Gespeichert!</p>}
        {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 rounded-lg border border-primary/40 bg-background px-2 py-0.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        />
        <button onClick={save} disabled={saving} className="text-primary hover:text-primary/80 transition-colors">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(video.claimed_views?.toString() ?? ""); setEditing(true); }}
      className="group flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Klicken zum Eintragen"
    >
      <span className="tabular-nums">{video.claimed_views !== null ? formatNum(video.claimed_views) : "—"}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

// ── Proof Cell ────────────────────────────────────────────────
function ProofCell({ video, onReload, mobile }: { video: VideoRow; onReload: () => void; mobile?: boolean }) {
  const [uploading,   setUploading]   = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [errMsg,      setErrMsg]      = useState<string | null>(null);
  const [showViewer,  setShowViewer]  = useState(false);

  const status     = video.proof_status;
  const isApproved = status === "proof_approved";
  const hasProof   = !!video.proof_url;

  // ── Upload single file ───────────────────────────────────────
  async function upload(file: File) {
    setUploading(true);
    setErrMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/videos/${video.id}/proof`, { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error || "Fehler beim Hochladen";
      setErrMsg(msg);
      setTimeout(() => setErrMsg(null), 8000);
    } else {
      onReload();
    }
  }

  // ── Delete proof ─────────────────────────────────────────────
  async function deleteProof() {
    if (!confirm("Nachweis wirklich löschen?")) return;
    setDeleting(true);
    await fetch(`/api/videos/${video.id}/proof`, { method: "DELETE" });
    setDeleting(false);
    onReload();
  }

  // ── Image viewer modal (mobile) ──────────────────────────────
  const viewerModal = showViewer && video.proof_url && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={() => setShowViewer(false)}
    >
      <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setShowViewer(false)}
          className="absolute -top-10 right-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={video.proof_url}
          alt="Nachweis"
          className="max-w-[90vw] max-h-[80vh] rounded-xl object-contain"
        />
      </div>
    </div>
  );

  // ── Desktop compact view ─────────────────────────────────────
  if (!mobile) {
    // Approved — no actions
    if (isApproved) return (
      <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">
        ✓ Genehmigt
      </span>
    );

    // Has proof (submitted / under review / rejected) — show status + delete
    if (hasProof) return (
      <div className="flex items-center gap-1.5">
        <span className={`rounded-md border px-1.5 py-0.5 text-xs font-medium ${
          status === "proof_rejected"
            ? "border-red-500/20 bg-red-500/10 text-red-400"
            : "border-amber-500/20 bg-amber-500/10 text-amber-400"
        }`}>
          {status === "proof_rejected" ? "✕ Abgelehnt" : "⏳ Prüfung"}
        </span>
        <button
          onClick={deleteProof}
          disabled={deleting}
          title="Nachweis löschen"
          className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          {deleting
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <X className="h-3 w-3" />}
        </button>
      </div>
    );

    // No proof — upload button
    if (uploading) return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" /> Lädt…
      </span>
    );
    return (
      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/30 hover:bg-accent transition-all">
        <Upload className="h-3.5 w-3.5" /> Hochladen
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }}
        />
      </label>
    );
  }

  // ── Mobile full view ─────────────────────────────────────────

  // Approved — show image + approved badge, no delete
  if (isApproved) return (
    <div className="space-y-2">
      {viewerModal}
      {video.proof_url && (
        <div
          className="relative rounded-xl overflow-hidden border border-emerald-500/30 cursor-pointer"
          onClick={() => setShowViewer(true)}
        >
          <img src={video.proof_url} alt="Nachweis" className="w-full h-32 object-cover" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
            <Eye className="h-6 w-6 text-white drop-shadow" />
          </div>
          <div className="absolute top-2 left-2 rounded bg-emerald-500/80 px-1.5 py-0.5 text-[10px] text-white font-semibold backdrop-blur-sm">
            ✓ Genehmigt
          </div>
        </div>
      )}
      <p className="text-xs text-emerald-400 font-medium text-center">Beleg wurde genehmigt</p>
    </div>
  );

  // Has proof (submitted / under review / rejected) — show image + status + delete
  if (hasProof) return (
    <div className="space-y-2">
      {viewerModal}

      {/* Rejection banner */}
      {status === "proof_rejected" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-xs text-red-400 font-semibold">✕ Nachweis abgelehnt</p>
          {video.proof_rejection_reason && (
            <p className="text-xs text-red-300 mt-0.5">{video.proof_rejection_reason}</p>
          )}
        </div>
      )}

      {/* Proof thumbnail */}
      {video.proof_url && (
        <div
          className={`relative rounded-xl overflow-hidden border cursor-pointer ${
            status === "proof_rejected" ? "border-red-500/30" : "border-amber-500/30"
          }`}
          onClick={() => setShowViewer(true)}
        >
          <img src={video.proof_url} alt="Nachweis" className="w-full h-36 object-cover" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
            <Eye className="h-6 w-6 text-white drop-shadow" />
          </div>
          <div className={`absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm ${
            status === "proof_rejected"
              ? "bg-red-500/80 text-white"
              : "bg-amber-500/80 text-white"
          }`}>
            {status === "proof_rejected" ? "✕ Abgelehnt" : "⏳ In Prüfung"}
          </div>
        </div>
      )}

      {/* Status text + delete */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {status === "proof_rejected"
            ? "Bitte Nachweis löschen und neu hochladen"
            : "Nachweis wird geprüft"}
        </p>
        <button
          onClick={deleteProof}
          disabled={deleting}
          className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {deleting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Löschen
        </button>
      </div>

      {errMsg && <p className="text-xs text-red-400 break-words">Fehler: {errMsg}</p>}
    </div>
  );

  // Proof requested by ops — no proof yet but highlight
  if (status === "proof_requested") return (
    <div className="space-y-2">
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2">
        <p className="text-xs text-orange-400 font-semibold">⚠ Admin hat Nachweis angefordert</p>
        <p className="text-xs text-muted-foreground mt-0.5">Bitte einen Screenshot hochladen.</p>
      </div>
      <label className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 transition-all ${
        uploading ? "border-primary/40 bg-primary/5" : "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10"
      }`}>
        {uploading
          ? <><RefreshCw className="h-4 w-4 animate-spin text-primary" /><span className="text-sm text-primary">Lädt hoch…</span></>
          : <><Upload className="h-4 w-4 text-orange-400" /><span className="text-sm text-orange-400">Screenshot hochladen</span></>}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading}
          onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }}
        />
      </label>
      {errMsg && <p className="text-xs text-red-400 break-words">Fehler: {errMsg}</p>}
    </div>
  );

  // No proof yet — clean upload zone
  return (
    <div className="space-y-2">
      <label className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 transition-all ${
        uploading
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-muted/20 hover:border-primary/40 hover:bg-accent/20"
      }`}>
        {uploading
          ? <><RefreshCw className="h-4 w-4 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Lädt hoch…</span></>
          : <><Upload className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Screenshot hochladen</span></>}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading}
          onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }}
        />
      </label>
      {errMsg && <p className="text-xs text-red-400 break-words">Fehler: {errMsg}</p>}
    </div>
  );
}

// ── Row background for discrepancy ───────────────────────────
function getRowClass(discrepancy: string | null): string {
  if (discrepancy === "critical_difference") return "border-l-2 border-red-500 bg-red-500/5";
  if (discrepancy === "suspicious_difference") return "border-l-2 border-amber-500 bg-amber-500/5";
  return "";
}

// ── Main Page ─────────────────────────────────────────────────
export default function CutterVideosPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);

  function loadVideos() {
    setLoading(true);
    fetch("/api/videos")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => { if (data?.videos) setVideos(data.videos); })
      .finally(() => setLoading(false));
  }

  // Silent reload — updates data in background without showing skeleton
  function reloadSilent() {
    fetch("/api/videos")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => { if (data?.videos) setVideos(data.videos); });
  }

  useEffect(() => { loadVideos(); }, []);

  function handleClaimedUpdate(id: string, val: number | null) {
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, claimed_views: val } : v));
  }

  async function handleDelete(id: string) {
    if (!confirm("Video wirklich entfernen?")) return;
    const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
    if (res.ok) setVideos((v) => v.filter((x) => x.id !== id));
    else {
      const data = await res.json();
      alert(data.error || "Fehler beim Löschen");
    }
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-7xl p-6">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Videos</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {videos.length} {videos.length === 1 ? "Video" : "Videos"} insgesamt
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadVideos}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
              title="Aktualisieren"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/videos/submit"
              className="btn-glow flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Video einreichen
            </Link>
          </div>
        </div>

        {/* Skeleton while loading */}
        {loading ? (
          <TableSkeleton />
        ) : videos.length === 0 ? (
          /* Empty state */
          <div className="rounded-xl border border-border bg-card flex flex-col items-center py-20 px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted border border-border">
              <Video className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">Noch keine Videos</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Reiche dein erstes Video ein. Wir tracken die Views automatisch und du kannst sie zur Rechnung einreichen.
            </p>
            <Link
              href="/videos/submit"
              className="btn-glow flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Erstes Video einreichen
            </Link>
          </div>
        ) : (
          <>
            {/* ── Mobile Cards (hidden on md+) ───────────────────── */}
            <div className="md:hidden space-y-3">
              {videos.map((v) => {
                const s = getClipStatus(v);
                const cfg = STATUS_CONFIG[s];
                return (
                  <div key={v.id} className={`rounded-xl border border-border bg-card p-4 ${getRowClass(v.discrepancy_status)}`}>
                    {/* Title + platform */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm leading-tight mb-1">{v.title || "Ohne Titel"}</p>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] || "bg-muted text-muted-foreground"}`}>
                            {PLATFORM_LABELS[v.platform] || v.platform}
                          </span>
                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Views ✓</p>
                        <p className="text-sm font-bold tabular-nums">{formatNum(v.current_views)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Abrechenbar</p>
                        <p className={`text-sm font-bold tabular-nums ${v.unbilled_views > 0 ? "text-primary" : ""}`}>
                          {v.unbilled_views > 0 ? `+${formatNum(v.unbilled_views)}` : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Sync</p>
                        <p className="text-xs text-muted-foreground leading-tight pt-0.5">{formatRelativeTime(v.last_scraped_at)}</p>
                      </div>
                    </div>

                    {/* Manual views input — big and easy to tap */}
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-1.5">Meine Views (manuell)</p>
                      <ClaimedViewsCell video={v} onUpdate={handleClaimedUpdate} mobile />
                    </div>

                    {/* Proof upload — full width button */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Nachweis (Screenshot)</p>
                      <ProofCell video={v} onReload={reloadSilent} mobile />
                    </div>

                    {/* Link */}
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{v.url}</span>
                    </a>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop Table (hidden on mobile) ──────────────── */}
            <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Video</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Plattform</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Views ✓</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">
                        <span title="Deine gemeldeten Views — klicken zum Bearbeiten">Views ~</span>
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Clip-Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Zuletzt sync</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Neu</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Nachweis</th>
                      <th className="w-10 px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {videos.map((v) => (
                      <tr key={v.id} className={`hover:bg-accent/20 transition-colors ${getRowClass(v.discrepancy_status)}`}>
                        <td className="max-w-xs px-4 py-3.5">
                          <p className="truncate font-medium text-sm">{v.title || "Ohne Titel"}</p>
                          <a href={v.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5">
                            <span className="truncate max-w-[180px]">{v.url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] || "bg-muted text-muted-foreground"}`}>
                            {PLATFORM_LABELS[v.platform] || v.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatNum(v.current_views)}</td>
                        <td className="px-4 py-3.5 text-right">
                          <ClaimedViewsCell video={v} onUpdate={handleClaimedUpdate} />
                        </td>
                        <td className="px-4 py-3.5">
                          {(() => { const s = getClipStatus(v); const cfg = STATUS_CONFIG[s];
                            return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{formatRelativeTime(v.last_scraped_at)}</td>
                        <td className="px-4 py-3.5 text-right">
                          {v.unbilled_views > 0
                            ? <span className="font-semibold text-primary tabular-nums">+{formatNum(v.unbilled_views)}</span>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5"><ProofCell video={v} onReload={reloadSilent} /></td>
                        <td className="px-4 py-3.5">
                          <button onClick={() => handleDelete(v.id)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Helper text */}
        {!loading && videos.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            <strong>Views ✓</strong> = verifiziert durch Scraping &nbsp;·&nbsp;
            <strong>Views ~</strong> = deine Angabe (klicken zum Bearbeiten) &nbsp;·&nbsp;
            <strong>Neu</strong> = noch nicht abgerechnete Views &nbsp;·&nbsp;
            <strong>Clip-Status</strong> = aktueller Prüf-Status
          </p>
        )}
      </main>
    </>
  );
}
