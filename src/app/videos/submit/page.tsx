"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ArrowLeft, Send, CheckCircle2, XCircle, ExternalLink,
  Plus, ChevronDown, Loader2, AlertTriangle, Copy, Image,
} from "lucide-react";
import type { PreviewResponse, PreviewError } from "@/app/api/videos/preview/route";

// ── Types ─────────────────────────────────────────────────────

interface Episode {
  id: string;
  title: string;
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; code: string; message: string }
  | { status: "ready"; data: PreviewResponse };

// ── Platform config ───────────────────────────────────────────

const PLATFORM_CONFIG: Record<string, {
  label: string;
  badge: string;
  icon: string;
  placeholder: string;
}> = {
  youtube:   {
    label: "YouTube Short",
    badge: "bg-red-500/10 text-red-400 border border-red-500/20",
    icon: "YT",
    placeholder: "https://www.youtube.com/shorts/...",
  },
  tiktok:    {
    label: "TikTok",
    badge: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
    icon: "TK",
    placeholder: "https://www.tiktok.com/@handle/video/...",
  },
  instagram: {
    label: "Instagram Reel",
    badge: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
    icon: "IG",
    placeholder: "https://www.instagram.com/reel/...",
  },
  facebook:  {
    label: "Facebook Reel",
    badge: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    icon: "FB",
    placeholder: "https://www.facebook.com/reel/...",
  },
};

// ── Error code → helpful message ──────────────────────────────

function errorDetails(code: string, message: string): {
  headline: string;
  hint: string | null;
  hintHref?: string;
  hintLabel?: string;
} {
  switch (code) {
    case "INVALID_URL":
      return {
        headline: message,
        hint: "Füge den vollständigen Link ein, z.B. https://www.tiktok.com/@...",
      };
    case "UNSUPPORTED_PLATFORM":
      return {
        headline: message,
        hint: null,
      };
    case "WRONG_CONTENT_TYPE":
      return {
        headline: message,
        hint: "Öffne das Video und kopiere den Link direkt aus der Adressleiste oder dem Teilen-Menü.",
      };
    case "NO_VIDEO_ID":
      return {
        headline: message,
        hint: "Prüfe das Format — der Link sollte auf ein einzelnes Video zeigen.",
      };
    case "SHORT_URL":
      return {
        headline: message,
        hint: null,
      };
    default:
      return { headline: message, hint: null };
  }
}

// ── Preview Card ──────────────────────────────────────────────

function PreviewCard({ preview }: { preview: PreviewResponse }) {
  const cfg = PLATFORM_CONFIG[preview.platform] ?? PLATFORM_CONFIG.youtube;

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 overflow-hidden">
      {/* Thumbnail row */}
      {preview.thumbnail ? (
        <div className="relative w-full bg-muted/30 flex items-center justify-center overflow-hidden" style={{ height: 160 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.thumbnail}
            alt="Vorschau"
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {/* Platform badge overlay */}
          <span className={`absolute top-2 left-2 rounded-md px-2 py-0.5 text-xs font-semibold ${cfg.badge} backdrop-blur-sm`}>
            {preview.displayHint}
          </span>
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center bg-muted/20 border-b border-border/50">
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <Image className="h-6 w-6 opacity-30" />
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
              {preview.displayHint}
            </span>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="p-4 space-y-2.5">
        {/* Title */}
        {preview.title ? (
          <p className="text-sm font-semibold leading-snug line-clamp-2">{preview.title}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Kein Titel verfügbar</p>
        )}

        {/* Author */}
        {preview.channelName && (
          <p className="text-xs text-muted-foreground">von {preview.channelName}</p>
        )}

        {/* Identifiers */}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
            {cfg.label}
          </span>
          {preview.accountHandle && (
            <span className="rounded-md bg-muted/50 border border-border px-2 py-0.5 text-xs font-mono text-muted-foreground">
              @{preview.accountHandle}
            </span>
          )}
          <span className="rounded-md bg-muted/50 border border-border px-2 py-0.5 text-xs font-mono text-muted-foreground" title="Video-ID">
            {preview.videoId.length > 16 ? `${preview.videoId.slice(0, 14)}…` : preview.videoId}
          </span>
        </div>

        {/* Short URL notice */}
        {preview.isShortUrl && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Kurzlink erkannt — vollständige Metadaten erst nach dem Einreichen verfügbar.</span>
          </div>
        )}

        {/* Normalized URL */}
        <a
          href={preview.normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate transition-colors"
        >
          <span className="truncate">{preview.normalizedUrl}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </div>
    </div>
  );
}

// ── Duplicate Warning ─────────────────────────────────────────

function DuplicateWarning({ dup }: { dup: NonNullable<PreviewResponse["duplicate"]> }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-300">Dieser Clip ist bereits im System</p>
        {dup.title && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{dup.title}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          Eingereicht: {new Date(dup.created_at).toLocaleDateString("de-DE")}
          {dup.current_views > 0 && ` · ${new Intl.NumberFormat("de-DE").format(dup.current_views)} Views`}
        </p>
      </div>
      <Link
        href={`/ops/clips/${dup.id}`}
        className="shrink-0 flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
      >
        Anzeigen
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ── URL Input with live preview ───────────────────────────────

function UrlInputSection({
  url,
  preview,
  onChange,
}: {
  url: string;
  preview: PreviewState;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    // Let the paste happen first, then the onChange fires
    const pasted = e.clipboardData.getData("text").trim();
    if (pasted) onChange(pasted);
  }

  const borderClass =
    url.trim() === ""
      ? "border-input focus:border-primary focus:ring-1 focus:ring-primary/30"
      : preview.status === "ready"
      ? "border-emerald-500/60 ring-1 ring-emerald-500/20 focus:border-emerald-500/80"
      : preview.status === "error"
      ? "border-red-500/60 ring-1 ring-red-500/20 focus:border-red-500/80"
      : preview.status === "loading"
      ? "border-primary/40 ring-1 ring-primary/20"
      : "border-input focus:border-primary focus:ring-1 focus:ring-primary/30";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <label className="block text-sm font-semibold">
        Video-Link
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder="Link einfügen — TikTok, YouTube, Instagram oder Facebook"
          autoComplete="off"
          spellCheck={false}
          className={`w-full rounded-lg border bg-background px-3.5 py-3 pr-10 text-sm outline-none transition-all duration-150 placeholder:text-muted-foreground ${borderClass}`}
        />
        {/* Status icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {preview.status === "loading" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {preview.status === "ready" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          )}
          {preview.status === "error" && (
            <XCircle className="h-4 w-4 text-red-400" />
          )}
        </div>
      </div>

      {/* Inline status feedback */}
      {url.trim() !== "" && preview.status === "ready" && (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PLATFORM_CONFIG[preview.data.platform]?.badge ?? "bg-muted"}`}>
            {preview.data.displayHint}
          </span>
          {preview.data.accountHandle && (
            <span className="text-xs text-muted-foreground font-mono">@{preview.data.accountHandle}</span>
          )}
          <span className="text-xs text-muted-foreground font-mono opacity-60">
            ID: {preview.data.videoId.slice(0, 16)}{preview.data.videoId.length > 16 ? "…" : ""}
          </span>
        </div>
      )}

      {url.trim() !== "" && preview.status === "error" && (
        <div className="space-y-1.5">
          {(() => {
            const d = errorDetails(preview.code, preview.message);
            return (
              <>
                <div className="flex items-start gap-2">
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400 mt-0.5" />
                  <span className="text-xs text-red-400">{d.headline}</span>
                </div>
                {d.hint && (
                  <p className="text-xs text-muted-foreground pl-5">{d.hint}</p>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Supported formats hint */}
      {url.trim() === "" && (
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => (
            <span key={key} className={`rounded-md px-2 py-0.5 text-xs font-medium opacity-60 ${cfg.badge}`}>
              {cfg.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function SubmitVideosPage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [claimedViews, setClaimedViews] = useState("");
  const [cutterNote, setCutterNote] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load episodes
  useEffect(() => {
    fetch("/api/episodes")
      .then((r) => {
        if (r.status === 401 || r.status === 403) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => { if (data?.episodes) setEpisodes(data.episodes); })
      .catch(() => {});
  }, [router]);

  // Preview fetcher with debounce
  const fetchPreview = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) { setPreview({ status: "idle" }); return; }

    setPreview({ status: "loading" });

    try {
      const res = await fetch("/api/videos/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      if (res.status === 401) { router.push("/login"); return; }

      const json = await res.json() as PreviewResponse | PreviewError;

      if (json.ok) {
        setPreview({ status: "ready", data: json as PreviewResponse });
        // Auto-populate title if available and title field is empty
        if ((json as PreviewResponse).title && !title) {
          setTitle((json as PreviewResponse).title!);
        }
      } else {
        const err = json as PreviewError;
        setPreview({ status: "error", code: err.code, message: err.message });
      }
    } catch {
      setPreview({ status: "error", code: "NETWORK_ERROR", message: "Verbindungsfehler — bitte erneut versuchen" });
    }
  }, [router, title]);

  // Trigger preview on URL change (debounced)
  const handleUrlChange = useCallback((val: string) => {
    setUrl(val);
    setSubmitError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      setPreview({ status: "idle" });
      return;
    }

    // Show loading immediately if it looks like a complete URL
    if (val.trim().length > 10 && (val.includes('.') || val.startsWith('http'))) {
      setPreview({ status: "loading" });
      debounceRef.current = setTimeout(() => fetchPreview(val), 600);
    } else {
      debounceRef.current = setTimeout(() => fetchPreview(val), 900);
    }
  }, [fetchPreview]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview.status !== "ready" || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const parsedViews = claimedViews.trim() ? parseInt(claimedViews, 10) : undefined;

      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [preview.data.normalizedUrl],
          title: title.trim() || undefined,
          episode_id: episodeId || undefined,
          claimed_views: parsedViews && !isNaN(parsedViews) && parsedViews >= 0 ? parsedViews : undefined,
          cutter_note: cutterNote.trim() || undefined,
        }),
      });

      if (res.status === 401 || res.status === 403) { router.push("/login"); return; }

      const data = await res.json();

      if (data.rejected?.length > 0) {
        const reason: string = data.rejected[0].reason;
        // Duplicate → show it in the preview
        if (reason.toLowerCase().includes("bereits") || reason.toLowerCase().includes("already") || reason.toLowerCase().includes("duplicate")) {
          setSubmitError("Dieser Clip wurde bereits eingereicht.");
        } else if (reason.toLowerCase().includes("konto") || reason.toLowerCase().includes("account")) {
          setSubmitError(reason);
        } else {
          setSubmitError(reason);
        }
      } else if (data.accepted?.length > 0) {
        setSuccess(true);
      } else {
        setSubmitError("Unbekannter Fehler beim Einreichen.");
      }
    } catch {
      setSubmitError("Verbindungsfehler — bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setUrl("");
    setTitle("");
    setEpisodeId("");
    setClaimedViews("");
    setCutterNote("");
    setPreview({ status: "idle" });
    setSubmitError(null);
    setSuccess(false);
  }

  const canSubmit = preview.status === "ready" && !preview.data.duplicate && !submitting;

  // ── Success ──────────────────────────────────────────────────
  if (success && preview.status === "ready") {
    const cfg = PLATFORM_CONFIG[preview.data.platform];
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-lg px-6 py-8">
          <div className="mt-8 flex flex-col items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center gap-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-400" />
            <div>
              <h2 className="text-xl font-bold text-emerald-400">Clip eingereicht!</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Dein Clip wurde übermittelt. Views werden automatisch getrackt.
              </p>
            </div>
            {/* Summary of what was submitted */}
            <div className="w-full rounded-xl border border-border bg-card p-4 text-left space-y-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                  {cfg.label}
                </span>
                {preview.data.accountHandle && (
                  <span className="text-xs text-muted-foreground font-mono">@{preview.data.accountHandle}</span>
                )}
              </div>
              {(title || preview.data.title) && (
                <p className="text-sm font-medium line-clamp-2">{title || preview.data.title}</p>
              )}
              <a href={preview.data.normalizedUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate transition-colors">
                <span className="truncate">{preview.data.normalizedUrl}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={resetForm}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                Weiteren einreichen
              </button>
              <Link
                href="/videos"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Meine Videos
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ── Main form ────────────────────────────────────────────────
  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-lg px-6 py-8 space-y-5">
        <Link href="/videos" className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zu Videos
        </Link>

        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clip einreichen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Link einfügen — Plattform und Vorschau werden automatisch erkannt.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* URL input + inline status */}
          <UrlInputSection url={url} preview={preview} onChange={handleUrlChange} />

          {/* Live preview card */}
          {preview.status === "ready" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <PreviewCard preview={preview.data} />

              {/* Duplicate warning */}
              {preview.data.duplicate && (
                <DuplicateWarning dup={preview.data.duplicate} />
              )}
            </div>
          )}

          {/* Episode selector */}
          <div className="rounded-xl border border-border bg-card p-5">
            <label className="mb-2 block text-sm font-semibold">
              Folge <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <div className="relative">
              <select
                value={episodeId}
                onChange={(e) => setEpisodeId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 cursor-pointer pr-8"
              >
                <option value="">Keine Folge zuordnen</option>
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.title}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Optional fields */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptional((p) => !p)}
              className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold hover:bg-accent/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                Weitere Details
                {(title || claimedViews || cutterNote) && (
                  <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                    {[title, claimedViews, cutterNote].filter(Boolean).length}
                  </span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showOptional ? "rotate-180" : ""}`} />
            </button>

            {showOptional && (
              <div className="border-t border-border px-5 py-4 space-y-4">
                {/* Titel */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium">Titel / Hook</label>
                    {preview.status === "ready" && preview.data.title && title !== preview.data.title && (
                      <button
                        type="button"
                        onClick={() => setTitle(preview.data.title!)}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        Von Vorschau übernehmen
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      preview.status === "ready" && preview.data.title
                        ? preview.data.title
                        : "z.B. 'Fabian über Marketing-Fehler'"
                    }
                    maxLength={140}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                {/* Aktuelle Views */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Aktuelle Views <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={claimedViews}
                    onChange={(e) => setClaimedViews(e.target.value)}
                    placeholder="z.B. 15000"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kannst du später auch in der Videos-Übersicht eintragen oder ändern.
                  </p>
                </div>

                {/* Notiz */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Notiz <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    value={cutterNote}
                    onChange={(e) => setCutterNote(e.target.value)}
                    placeholder="z.B. 'Views aus Instagram Insights, Screenshot folgt'"
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
              {submitError.includes("Konto") && (
                <Link href="/accounts" className="ml-auto shrink-0 flex items-center gap-1 text-xs underline hover:no-underline">
                  Konten <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird eingereicht…
              </>
            ) : preview.status === "ready" && preview.data.duplicate ? (
              <>
                <XCircle className="h-4 w-4" />
                Bereits eingereicht
              </>
            ) : preview.status === "ready" ? (
              <>
                <Send className="h-4 w-4" />
                Clip einreichen
              </>
            ) : (
              <>
                <Send className="h-4 w-4 opacity-50" />
                Link einfügen zum Einreichen
              </>
            )}
          </button>

        </form>
      </main>
    </>
  );
}
