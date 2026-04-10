"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  MessageSquare,
  Lock,
  Eye,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface ClipNote {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  visibility: "internal" | "cutter_visible";
  original_body: string | null;
  edited_at: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "gerade eben";
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getRoleLabel(role: string): string {
  if (role === "super_admin") return "Admin";
  if (role === "ops_manager") return "Ops";
  return "Cutter";
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Note Row ──────────────────────────────────────────────────

function NoteRow({
  note,
  isOwn,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  note: ClipNote;
  isOwn: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (note: ClipNote) => void;
  onDelete: (id: string) => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const isCutterVisible = note.visibility === "cutter_visible";
  const hasEdit = !!note.edited_at;

  return (
    <div className={`px-5 py-4 group ${isCutterVisible ? "bg-blue-500/5" : ""}`}>
      {/* Author header */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar */}
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold
              ${isOwn ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
          >
            {getInitials(note.author_name)}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium leading-none">{note.author_name}</span>
              <span className="text-xs text-muted-foreground/70">{getRoleLabel(note.author_role)}</span>
              {isCutterVisible && (
                <span className="flex items-center gap-0.5 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400">
                  <Eye className="h-3 w-3" />
                  Cutter sieht dies
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Timestamp + actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-xs text-muted-foreground/50 whitespace-nowrap"
            title={formatDateTime(note.created_at)}
          >
            {formatRelative(note.created_at)}
          </span>
          {canEdit && (
            <button
              onClick={() => onEdit(note)}
              className="rounded p-1 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-muted-foreground transition-all"
              title="Bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(note.id)}
              className="rounded p-1 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
              title="Löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="ml-9">
        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{note.body}</p>

        {/* Edit history toggle */}
        {hasEdit && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowOriginal(p => !p)}
              className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {showOriginal ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Bearbeitet {formatRelative(note.edited_at!)}
              {showOriginal ? " · Original ausblenden" : " · Original anzeigen"}
            </button>
            {showOriginal && note.original_body && (
              <div className="mt-1.5 rounded border-l-2 border-border pl-3 text-xs text-muted-foreground/60 italic whitespace-pre-wrap">
                {note.original_body}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline Edit Form ──────────────────────────────────────────

function EditForm({
  note,
  onSave,
  onCancel,
}: {
  note: ClipNote;
  onSave: (id: string, body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const isCutterVisible = note.visibility === "cutter_visible";

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    await onSave(note.id, text.trim());
    setSaving(false);
  }

  return (
    <div className={`px-5 py-4 ${isCutterVisible ? "bg-blue-500/5" : "bg-muted/20"}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
          {getInitials(note.author_name)}
        </div>
        <span className="text-sm font-medium">{note.author_name}</span>
        <span className="text-xs text-muted-foreground/70 italic">wird bearbeitet…</span>
      </div>
      <div className="ml-9 space-y-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={Math.max(3, text.split("\n").length)}
          autoFocus
          className="w-full rounded-lg border border-primary/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!text.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Speichern
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3 w-3" />
            Abbrechen
          </button>
          <span className="text-xs text-muted-foreground/40 ml-auto">⌘↵ speichern · Esc abbrechen</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export function ClipNotesPanel({ videoId }: { videoId: string }) {
  const [notes, setNotes] = useState<ClipNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  // Compose state
  const [composeText, setComposeText] = useState("");
  const [composeVisibility, setComposeVisibility] = useState<"internal" | "cutter_visible">("internal");
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingNote, setEditingNote] = useState<ClipNote | null>(null);

  const listBottomRef = useRef<HTMLDivElement>(null);

  // Fetch current user identity (for edit/delete permission checks)
  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && !data.error) {
          setCurrentUserId(data.id);
          setCurrentRole(data.role);
        }
      })
      .catch(() => {});
  }, []);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/clips/${videoId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [videoId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function submitNote() {
    if (!composeText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/ops/clips/${videoId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: composeText.trim(), visibility: composeVisibility }),
      });
      if (res.ok) {
        setComposeText("");
        setComposeVisibility("internal");
        await fetchNotes();
        // Scroll to bottom after new note
        setTimeout(() => {
          listBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(noteId: string, body: string) {
    await fetch(`/api/ops/clips/${videoId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setEditingNote(null);
    await fetchNotes();
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm("Notiz wirklich löschen? Diese Aktion wird protokolliert.")) return;
    await fetch(`/api/ops/clips/${videoId}/notes/${noteId}`, { method: "DELETE" });
    await fetchNotes();
  }

  const canEditNote = (note: ClipNote) =>
    note.author_id === currentUserId || currentRole === "super_admin";
  const canDeleteNote = (note: ClipNote) =>
    note.author_id === currentUserId || currentRole === "super_admin";

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Interne Notizen</h2>
          {!loading && notes.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {notes.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <Lock className="h-3 w-3" />
          Nur für Ops &amp; Admin
        </div>
      </div>

      {/* ── Notes list (oldest → newest) ── */}
      <div className="divide-y divide-border/40">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Lädt…
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground/15 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Noch keine Notizen</p>
            <p className="text-xs text-muted-foreground/50 mt-1 max-w-xs">
              Füge interne Hinweise hinzu — z. B. Diskrepanz erklären, Prüfungsentscheidung
              dokumentieren oder Rückfragen vermerken.
            </p>
          </div>
        ) : (
          notes.map(note =>
            editingNote?.id === note.id ? (
              <EditForm
                key={note.id}
                note={note}
                onSave={saveEdit}
                onCancel={() => setEditingNote(null)}
              />
            ) : (
              <NoteRow
                key={note.id}
                note={note}
                isOwn={note.author_id === currentUserId}
                canEdit={canEditNote(note)}
                canDelete={canDeleteNote(note)}
                onEdit={n => setEditingNote(n)}
                onDelete={deleteNote}
              />
            )
          )
        )}
        <div ref={listBottomRef} />
      </div>

      {/* ── Compose area ── */}
      <div className="border-t border-border bg-muted/10 px-5 py-4 space-y-3">
        <textarea
          value={composeText}
          onChange={e => setComposeText(e.target.value)}
          placeholder="Neue Notiz… (z. B. Diskrepanz erklären, Beleg-Entscheidung dokumentieren, Follow-up vermerken)"
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary resize-none placeholder:text-muted-foreground/50 transition-colors"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote();
          }}
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Visibility toggle */}
          <button
            type="button"
            onClick={() =>
              setComposeVisibility(v => (v === "internal" ? "cutter_visible" : "internal"))
            }
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              composeVisibility === "cutter_visible"
                ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {composeVisibility === "cutter_visible" ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                Für Cutter sichtbar
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" />
                Nur intern
              </>
            )}
          </button>

          {/* Submit */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground/40 hidden sm:block">⌘↵</span>
            <button
              onClick={submitNote}
              disabled={!composeText.trim() || submitting}
              className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )}
              Speichern
            </button>
          </div>
        </div>

        {composeVisibility === "cutter_visible" && (
          <p className="text-xs text-blue-400/70 flex items-center gap-1.5">
            <Eye className="h-3 w-3" />
            Diese Notiz wird dem Cutter in seinem Dashboard angezeigt und im Audit-Log protokolliert.
          </p>
        )}
      </div>
    </div>
  );
}
