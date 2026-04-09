"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { Plus, Pencil, Trash2, Check, X, Film, RefreshCw } from "lucide-react";

interface EpisodeRow {
  id: string;
  title: string;
  description: string | null;
  platform: string | null;
  created_at: string;
  video_count: number;
  total_views: number;
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

function formatNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

interface NewEpisodeForm {
  title: string;
  platform: string;
}

interface EditState {
  id: string;
  title: string;
}

export default function EpisodesPage() {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<NewEpisodeForm>({ title: "", platform: "" });
  const [saving, setSaving] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/episodes");
    if (res.status === 401) { router.push("/login"); return; }
    const json = await res.json();
    setEpisodes(json.episodes ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.title.trim()) return;
    setSaving(true);
    await fetch("/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newForm.title.trim(),
        platform: newForm.platform || undefined,
      }),
    });
    setNewForm({ title: "", platform: "" });
    setShowNewForm(false);
    setSaving(false);
    await load();
  }

  async function handleEditSave(id: string) {
    if (!editState || editState.id !== id) return;
    setEditSaving(true);
    await fetch(`/api/episodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editState.title }),
    });
    setEditState(null);
    setEditSaving(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Episode wirklich löschen? Videos bleiben erhalten, werden aber nicht mehr zugeordnet.")) return;
    setDeleting(id);
    await fetch(`/api/episodes/${id}`, { method: "DELETE" });
    setDeleting(null);
    await load();
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Episoden</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gruppiere deine Videos in Episoden
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Neue Episode
            </button>
          </div>
        </div>

        {/* New Episode Form */}
        {showNewForm && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-semibold">Neue Episode erstellen</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Titel</label>
                <input
                  type="text"
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                  placeholder="Episodentitel"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Plattform (optional)</label>
                <select
                  value={newForm.platform}
                  onChange={(e) => setNewForm({ ...newForm, platform: e.target.value })}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Alle Plattformen</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving || !newForm.title.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewForm(false); setNewForm({ title: "", platform: "" }); }}
                  className="flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Lade Episoden…
          </div>
        ) : episodes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground text-sm">
            <Film className="h-8 w-8 mx-auto mb-3 opacity-40" />
            Noch keine Episoden
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <div key={ep.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                {/* Title row */}
                <div className="flex items-start gap-2">
                  {editState?.id === ep.id ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={editState.title}
                        onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                        className="h-8 flex-1 rounded border border-input bg-background px-2 text-sm outline-none focus:border-primary"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave(ep.id);
                          if (e.key === "Escape") setEditState(null);
                        }}
                      />
                      <button
                        onClick={() => handleEditSave(ep.id)}
                        disabled={editSaving}
                        className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditState(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="flex-1 font-semibold text-sm leading-tight">{ep.title}</p>
                      <button
                        onClick={() => setEditState({ id: ep.id, title: ep.title })}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Titel bearbeiten"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Platform badge */}
                {ep.platform && (
                  <span className={`self-start rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[ep.platform] ?? "bg-muted"}`}>
                    {PLATFORM_LABELS[ep.platform] ?? ep.platform}
                  </span>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{formatNum(ep.video_count)}</span> Videos
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{formatNum(ep.total_views)}</span> Views
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Link
                    href="/videos"
                    className="flex-1 text-center rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Videos zuweisen
                  </Link>
                  <button
                    onClick={() => handleDelete(ep.id)}
                    disabled={deleting === ep.id}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    title="Löschen"
                  >
                    {deleting === ep.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
