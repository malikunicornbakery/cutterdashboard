"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { UserPlus, Activity, RefreshCw, Youtube, Clock, AlertCircle, CheckCircle2, Trash2, Mail } from "lucide-react";

interface Cutter {
  id: string;
  name: string;
  email: string;
  rate_per_view: number;
  is_active: number;
  is_admin: number;
  role: "super_admin" | "ops_manager" | "cutter" | "viewer";
  video_count: number;
  total_invoiced: number;
  total_views: number;
  created_at: string;
}

interface Settings {
  recipient_company_name?: string;
  recipient_company_address?: string;
  recipient_tax_id?: string;
}

interface ScrapeStatus {
  lastScrapedAt: string | null;
  total24h: number;
  succeeded24h: number;
  failed24h: number;
  successRate24h: number | null;
  failuresByPlatform: Array<{ platform: string; count: number }>;
  recentFailures: Array<{
    scraped_at: string;
    error_message: string;
    platform: string;
    url: string;
    title: string | null;
  }>;
}

interface SyncLog {
  status: string;
  result: {
    accounts?: number;
    totalCreated?: number;
    totalUpdated?: number;
    totalVideosFound?: number;
    errors?: Array<{ cutter: string; platform: string; error: string }>;
  } | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

export default function CutterAdminPage() {
  const router = useRouter();
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRate, setNewRate] = useState("0.01");
  const [newRole, setNewRole] = useState("cutter");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ cutterId: string; link: string; name: string; emailSent: boolean; emailError: string | null } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function loadSyncLogs() {
    fetch("/api/admin/sync")
      .then((r) => r.json())
      .then((data) => data?.logs && setSyncLogs(data.logs))
      .catch(() => {});
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        loadAll();
        loadSyncLogs();
      } else {
        alert("Sync-Fehler: " + data.error);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function loadAll() {
    const [cuttersRes, settingsRes] = await Promise.all([
      fetch("/api/admin/cutters"),
      fetch("/api/admin/settings"),
    ]);
    if (cuttersRes.status === 401 || cuttersRes.status === 403) { router.push("/login"); return; }
    const cuttersData = await cuttersRes.json();
    if (cuttersData?.cutters) setCutters(cuttersData.cutters);
    const settingsData = await settingsRes.json();
    if (settingsData?.settings) setSettings(settingsData.settings);

    fetch("/api/admin/scrape-status")
      .then((r) => r.json())
      .then((data) => data?.lastScrapedAt !== undefined && setScrapeStatus(data))
      .catch(() => {});
  }

  useEffect(() => { loadAll(); loadSyncLogs(); }, [router]);

  async function handleCreateCutter(e?: React.FormEvent) {
    e?.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    if (!newName.trim()) { setCreateError("Name erforderlich"); return; }
    if (!newEmail.trim()) { setCreateError("E-Mail erforderlich"); return; }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/cutters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          rate_per_view: parseFloat(newRate.replace(",", ".")) || 0.01,
          role: newRole,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Update role immediately after creation if not "cutter"
        if (newRole !== "cutter") {
          await fetch("/api/admin/cutters", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: data.id, role: newRole }),
          });
        }
        setCreateSuccess(`${newName.trim()} wurde angelegt!`);
        setNewName("");
        setNewEmail("");
        setNewRate("0.01");
        setNewRole("cutter");
        await loadAll();
        setTimeout(() => { setShowNew(false); setCreateSuccess(""); }, 1500);
      } else {
        setCreateError(data.error || "Fehler beim Anlegen");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateCutter(id: string, field: string, value: number | string) {
    await fetch("/api/admin/cutters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    loadAll();
  }

  async function handleDeleteCutter(id: string, name: string) {
    if (!confirm(`${name} wirklich löschen? Alle Videos, Rechnungen und Accounts werden permanent gelöscht.`)) return;
    setDeletingId(id);
    try {
      await fetch("/api/admin/cutters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadAll();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleInviteCutter(id: string, name: string) {
    setInvitingId(id);
    try {
      const res = await fetch(`/api/admin/cutters/${id}/invite`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.token) {
        const base = window.location.origin;
        const link = `${base}/api/auth/verify?token=${data.token}`;
        setInviteLink({
          cutterId: id,
          link,
          name,
          emailSent: data.email_sent ?? false,
          emailError: data.email_error ?? null,
        });
      } else {
        alert("Einladung fehlgeschlagen");
      }
    } finally {
      setInvitingId(null);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink.link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-6 text-xl font-semibold">Admin</h1>

        {/* Cutter Management */}
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cutter-Verwaltung</h2>
            <button
              onClick={() => setShowNew(!showNew)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" />
              Neuer Cutter
            </button>
          </div>

          {showNew && (
            <form onSubmit={handleCreateCutter} className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              {createError && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  ⚠ {createError}
                </div>
              )}
              {createSuccess && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                  ✓ {createSuccess}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  autoComplete="off"
                  required
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="E-Mail"
                  type="email"
                  autoComplete="off"
                  required
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <input
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder="Rate/View"
                  autoComplete="off"
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary"
                >
                  <option value="cutter">Cutter</option>
                  <option value="ops_manager">Ops Manager</option>
                  <option value="super_admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="submit"
                  disabled={creating}
                  className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creating ? "Anlegen..." : "Anlegen"}
                </button>
              </div>
            </form>
          )}

          {/* Invite link panel */}
          {inviteLink && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-400 mb-1">
                    ✓ Einladungslink für {inviteLink.name}
                  </p>
                  {inviteLink.emailSent ? (
                    <p className="text-xs text-emerald-400/70 mb-2">✓ E-Mail wurde versendet</p>
                  ) : (
                    <p className="text-xs text-amber-400 mb-2">
                      ⚠ E-Mail konnte nicht gesendet werden
                      {inviteLink.emailError && <span className="text-muted-foreground"> — {inviteLink.emailError}</span>}
                      {" · "}Link unten kopieren und direkt schicken.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mb-2">Gültig 7 Tage.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-3 py-1.5 text-xs font-mono text-muted-foreground">
                      {inviteLink.link}
                    </code>
                    <button
                      onClick={copyInviteLink}
                      className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {linkCopied ? "✓ Kopiert!" : "Kopieren"}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setInviteLink(null)}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none shrink-0"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">E-Mail</th>
                    <th className="px-4 py-3 font-medium">Rolle</th>
                    <th className="px-4 py-3 font-medium text-right">Rate/View</th>
                    <th className="px-4 py-3 font-medium text-right">Videos</th>
                    <th className="px-4 py-3 font-medium text-right">Views</th>
                    <th className="px-4 py-3 font-medium text-right">Abgerechnet</th>
                    <th className="px-4 py-3 font-medium text-center">Aktiv</th>
                    <th className="px-4 py-3 font-medium text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cutters.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={c.role ?? "cutter"}
                          onChange={(e) => handleUpdateCutter(c.id, "role", e.target.value)}
                          className="h-7 rounded border border-input bg-background px-1.5 text-xs outline-none focus:border-primary"
                        >
                          <option value="super_admin">Admin</option>
                          <option value="ops_manager">Ops Manager</option>
                          <option value="cutter">Cutter</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          step="0.001"
                          defaultValue={c.rate_per_view}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== c.rate_per_view) {
                              handleUpdateCutter(c.id, "rate_per_view", val);
                            }
                          }}
                          className="h-7 w-20 rounded border border-input bg-background px-2 text-right text-sm outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">{c.video_count}</td>
                      <td className="px-4 py-3 text-right">{formatNum(c.total_views)}</td>
                      <td className="px-4 py-3 text-right">{formatEur(c.total_invoiced)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleUpdateCutter(c.id, "is_active", c.is_active ? 0 : 1)}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            c.is_active
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {c.is_active ? "Aktiv" : "Inaktiv"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleInviteCutter(c.id, c.name)}
                            disabled={invitingId === c.id}
                            title="Einladung schicken"
                            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                              inviteLink?.cutterId === c.id
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "hover:bg-muted text-muted-foreground hover:text-foreground"
                            } disabled:opacity-50`}
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCutter(c.id, c.name)}
                            disabled={deletingId === c.id}
                            title="Cutter löschen"
                            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Scrape Status */}
        {scrapeStatus && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Scrape-Status
            </h2>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="grid gap-4 sm:grid-cols-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Letzter Scrape</p>
                  <p className="text-sm font-medium">
                    {scrapeStatus.lastScrapedAt
                      ? new Date(scrapeStatus.lastScrapedAt + "Z").toLocaleString("de-DE")
                      : "Noch nie"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Erfolgsrate (24h)</p>
                  <p className={`text-sm font-medium ${
                    scrapeStatus.successRate24h !== null && scrapeStatus.successRate24h < 80
                      ? "text-red-400"
                      : "text-emerald-400"
                  }`}>
                    {scrapeStatus.successRate24h !== null ? `${scrapeStatus.successRate24h}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Erfolgreich (24h)</p>
                  <p className="text-sm font-medium text-emerald-400">{formatNum(scrapeStatus.succeeded24h)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fehlgeschlagen (24h)</p>
                  <p className={`text-sm font-medium ${scrapeStatus.failed24h > 0 ? "text-red-400" : ""}`}>
                    {formatNum(scrapeStatus.failed24h)}
                  </p>
                </div>
              </div>

              {scrapeStatus.failuresByPlatform.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Fehler nach Plattform (24h)</p>
                  <div className="flex gap-2">
                    {scrapeStatus.failuresByPlatform.map((f) => (
                      <span
                        key={f.platform}
                        className="rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400"
                      >
                        {f.platform}: {f.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {scrapeStatus.recentFailures.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Letzte Fehler</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Zeit</th>
                          <th className="px-3 py-2 font-medium">Plattform</th>
                          <th className="px-3 py-2 font-medium">Video</th>
                          <th className="px-3 py-2 font-medium">Fehler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {scrapeStatus.recentFailures.map((f, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {new Date(f.scraped_at + "Z").toLocaleString("de-DE", {
                                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                              })}
                            </td>
                            <td className="px-3 py-2">{f.platform}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate" title={f.url}>
                              {f.title || f.url}
                            </td>
                            <td className="px-3 py-2 max-w-[250px] truncate text-red-400" title={f.error_message}>
                              {f.error_message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Auto-Sync Panel */}
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Auto-Sync
            </h2>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sync läuft..." : "Jetzt synchronisieren"}
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 mb-3">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Täglich 04:00 Uhr (automatisch)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Läuft auf Vercel — auch wenn dein Laptop geschlossen ist. Zieht Views von allen verbundenen Klipper-Accounts.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Plattform-Status</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Youtube className="h-4 w-4 text-red-400" />
                  <span>YouTube</span>
                  <span className="ml-auto text-xs rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 font-medium">Bereit</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-4 text-[#ff0050] font-bold text-xs flex items-center justify-center">TK</span>
                  <span>TikTok</span>
                  <span className="ml-auto text-xs rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 font-medium">Business API nötig</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-4 text-pink-400 font-bold text-xs flex items-center justify-center">IG</span>
                  <span>Instagram</span>
                  <span className="ml-auto text-xs rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 font-medium">OAuth nötig</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-4 text-blue-400 font-bold text-xs flex items-center justify-center">FB</span>
                  <span>Facebook</span>
                  <span className="ml-auto text-xs rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-medium">Coming soon</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sync History */}
          {syncLogs.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium">Sync-Verlauf</p>
              </div>
              <div className="divide-y divide-border">
                {syncLogs.map((log, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {log.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : log.status === "running" ? (
                        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {log.status === "done" ? "Sync abgeschlossen" : log.status === "running" ? "Sync läuft..." : "Fehler"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.startedAt + "Z").toLocaleString("de-DE", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                          })}
                        </span>
                        {log.durationMs && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {(log.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {log.result && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.result.accounts ?? 0} Accounts · {log.result.totalVideosFound ?? 0} Videos gefunden · {log.result.totalCreated ?? 0} neu · {log.result.totalUpdated ?? 0} aktualisiert
                          {(log.result.errors?.length ?? 0) > 0 && (
                            <span className="text-amber-400 ml-1">· {log.result.errors?.length} Fehler</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Recipient Settings */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Rechnungsempfänger</h2>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-4 text-xs text-muted-foreground">
              Diese Daten erscheinen als Empfänger auf allen Cutter-Rechnungen.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Firmenname</p>
                <p className="text-sm font-medium">{settings.recipient_company_name || "—"}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">USt-IdNr.</p>
                <p className="text-sm font-medium">{settings.recipient_tax_id || "—"}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-1 text-xs text-muted-foreground">Adresse</p>
              <p className="text-sm font-medium">{settings.recipient_company_address || "—"}</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
