"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { PLATFORM_ORDER, PLATFORM_DEFS, type Platform } from "@/lib/platforms";
import {
  CheckCircle2, AlertTriangle, Trash2, ExternalLink,
  RefreshCw, Plus, Wifi, WifiOff, Link2, X,
} from "lucide-react";

interface ConnectedAccount {
  id: string;
  platform: Platform;
  account_handle: string | null;
  connection_status: string;
  connection_type: "oauth" | "manual";
  views_accessible: boolean;
  sync_error: string | null;
  last_synced_at: string | null;
}

type OAuthConfigured = Record<Platform, boolean>;

// ── Toast ──────────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }: {
  message: string; type: "success" | "error" | "warning"; onDismiss: () => void;
}) {
  const cls = {
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    error:   "border-red-500/30 bg-red-500/10 text-red-300",
    warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  }[type];
  return (
    <div
      onClick={onDismiss}
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/30 cursor-pointer backdrop-blur-sm ${cls}`}
    >
      {type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : type === "error" ? <X className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      {message}
    </div>
  );
}

// ── Platform Card ──────────────────────────────────────────────────
function PlatformCard({
  platform, account, oauthReady, disconnecting,
  onConnect, onManual, onDisconnect, onReconnect,
}: {
  platform: Platform;
  account: ConnectedAccount | null;
  oauthReady: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onManual: (h: string) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const def = PLATFORM_DEFS[platform];
  const [handleInput, setHandleInput] = useState("");
  const [showInput,   setShowInput]   = useState(false);

  const isConnected = account?.connection_status === "connected" || account?.connection_status === "connected_limited";
  const isManual    = account?.connection_status === "manual";
  const isExpired   = account?.connection_status === "token_expired";
  const isError     = account?.connection_status === "error";
  const isLinked    = isConnected || isManual || isExpired || isError;

  // Connection state styling
  const stateStyles = isConnected
    ? { border: "border-emerald-500/25", badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400", badgeIcon: <Wifi className="h-3 w-3" />, badgeLabel: "Verbunden" }
    : isManual
    ? { border: "border-yellow-500/20", badge: "border-yellow-500/25 bg-yellow-500/10 text-yellow-400", badgeIcon: <Link2 className="h-3 w-3" />, badgeLabel: "Manuell" }
    : isExpired || isError
    ? { border: "border-orange-500/20", badge: "border-orange-500/25 bg-orange-500/10 text-orange-400", badgeIcon: <WifiOff className="h-3 w-3" />, badgeLabel: "Problem" }
    : { border: "border-border/50", badge: "border-border/40 bg-muted/10 text-muted-foreground/50", badgeIcon: <WifiOff className="h-3 w-3" />, badgeLabel: "Nicht verbunden" };

  return (
    <div className={`rounded-lg border ${stateStyles.border} bg-card overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base border ${def.color_text} ${def.color_bg} ${def.color_border}`}>
          {def.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{def.label}</p>
          {account?.account_handle ? (
            <p className="text-xs text-muted-foreground truncate mt-0.5">@{account.account_handle}</p>
          ) : (
            <p className="text-xs text-muted-foreground/40 mt-0.5">Nicht verbunden</p>
          )}
        </div>
        <span className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium shrink-0 ${stateStyles.badge}`}>
          {stateStyles.badgeIcon}
          {stateStyles.badgeLabel}
        </span>
      </div>

      {/* Warnings */}
      {isExpired && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-orange-500/25 bg-orange-500/8 px-3 py-2 text-xs text-orange-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Token abgelaufen — bitte neu verbinden.
        </div>
      )}
      {isError && account?.sync_error && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-red-500/25 bg-red-500/8 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {account.sync_error}
        </div>
      )}
      {def.limitation_note && !isLinked && (
        <div className="mx-4 mb-3 flex items-start gap-2 text-xs text-muted-foreground/50">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500/40" />
          {def.limitation_note}
        </div>
      )}

      {/* Handle input */}
      {showInput && (
        <div className="mx-4 mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder={def.placeholder}
            className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter" && handleInput.trim()) { onManual(handleInput.trim()); setHandleInput(""); setShowInput(false); }
              if (e.key === "Escape") setShowInput(false);
            }}
          />
          <button
            onClick={() => { if (handleInput.trim()) { onManual(handleInput.trim()); setHandleInput(""); setShowInput(false); } }}
            disabled={!handleInput.trim()}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Speichern
          </button>
          <button
            onClick={() => setShowInput(false)}
            className="h-8 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* Actions */}
      {!showInput && (
        <div className="flex items-center gap-2 px-4 pb-4 flex-wrap">
          {!isLinked && (
            oauthReady ? (
              <button onClick={onConnect} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity">
                <Plus className="h-3.5 w-3.5" /> {def.connect_label}
              </button>
            ) : (
              <button onClick={() => setShowInput(true)} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Plus className="h-3.5 w-3.5" /> Handle eintragen
              </button>
            )
          )}

          {isManual && oauthReady && (
            <button onClick={onConnect} className="flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Per OAuth verbinden
            </button>
          )}

          {(isExpired || isError) && (
            <button onClick={onReconnect} className="flex items-center gap-1.5 rounded-md border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/15 transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Neu verbinden
            </button>
          )}

          {account?.account_handle && (
            <a href={`${def.url_prefix}${account.account_handle}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> Profil
            </a>
          )}

          {isLinked && (
            <button
              onClick={onDisconnect}
              disabled={disconnecting}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/8 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/15 hover:border-red-500/40 transition-colors disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
function AccountsPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [accounts,        setAccounts]        = useState<ConnectedAccount[]>([]);
  const [oauthConfigured, setOauthConfigured] = useState<OAuthConfigured>({
    youtube: false, instagram: false, facebook: false, tiktok: false,
  });
  const [toast,           setToast]           = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  function showToast(message: string, type: "success" | "error" | "warning") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  useEffect(() => {
    const success = searchParams.get("success");
    const error   = searchParams.get("error");
    const MSGS: Record<string, [string, "success" | "error" | "warning"]> = {
      youtube_connected:      ["YouTube erfolgreich verbunden.", "success"],
      instagram_connected:    ["Instagram erfolgreich verbunden.", "success"],
      youtube_denied:         ["YouTube-Verbindung abgebrochen.", "warning"],
      instagram_denied:       ["Instagram-Verbindung abgelehnt.", "warning"],
      invalid_state:          ["Sicherheitsfehler. Bitte erneut versuchen.", "error"],
      youtube_failed:         ["YouTube-Verbindung fehlgeschlagen.", "error"],
      youtube_not_configured: ["YouTube OAuth ist noch nicht konfiguriert.", "warning"],
      youtube_no_channel:     ["Kein YouTube-Kanal gefunden.", "error"],
      instagram_failed:       ["Instagram-Verbindung fehlgeschlagen.", "error"],
    };
    const key = success ?? error ?? null;
    if (key && MSGS[key]) { showToast(...MSGS[key]); router.replace("/accounts"); }
  }, [searchParams, router]);

  function loadAccounts() {
    fetch("/api/accounts")
      .then((r) => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then((data) => {
        if (!data) return;
        setAccounts(data.accounts ?? []);
        if (data.oauth_configured) setOauthConfigured(data.oauth_configured);
      });
  }

  useEffect(() => { loadAccounts(); }, []);

  async function handleManual(platform: Platform, handle: string) {
    const res = await fetch("/api/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, account_handle: handle }),
    });
    if (res.ok) { showToast("Handle gespeichert.", "success"); loadAccounts(); }
    else { const d = await res.json(); showToast(d.error || "Fehler beim Speichern.", "error"); }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Verbindung wirklich löschen?")) return;
    setDisconnectingId(id);
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setDisconnectingId(null);
    if (res.ok) { setAccounts((prev) => prev.filter((a) => a.id !== id)); showToast("Verbindung gelöscht.", "warning"); }
    else showToast("Fehler beim Löschen.", "error");
  }

  const connectedCount = accounts.filter((a) =>
    a.connection_status === "connected" || a.connection_status === "connected_limited" || a.connection_status === "manual"
  ).length;

  return (
    <>
      <CutterNav />
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">

        {/* ── Page header ──────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Plattform-Verbindungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {connectedCount > 0
              ? `${connectedCount} von 4 Plattformen verbunden`
              : "Verbinde deine Kanäle für automatisches View-Tracking"}
          </p>
        </div>

        {/* ── Platform cards ────────────────────────────────────── */}
        <div className="space-y-3">
          {PLATFORM_ORDER.map((platform) => {
            const account = accounts.find((a) => a.platform === platform) ?? null;
            return (
              <PlatformCard
                key={platform}
                platform={platform}
                account={account}
                oauthReady={oauthConfigured[platform]}
                disconnecting={disconnectingId === account?.id}
                onConnect={() => { window.location.href = `/api/auth/${platform}`; }}
                onManual={(h) => handleManual(platform, h)}
                onDisconnect={() => account && handleDisconnect(account.id)}
                onReconnect={() => { window.location.href = `/api/auth/${platform}`; }}
              />
            );
          })}
        </div>

        {/* ── Info note ─────────────────────────────────────────── */}
        <p className="text-xs text-muted-foreground/50 text-center pb-2">
          Verbundene Konten ermöglichen automatisches View-Tracking. Manuelle Handles werden regelmäßig gescrapt.
        </p>

      </main>
    </>
  );
}

export default function CutterAccountsPage() {
  return <Suspense><AccountsPageInner /></Suspense>;
}
