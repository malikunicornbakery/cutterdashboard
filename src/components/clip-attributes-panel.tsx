"use client";

import { useEffect, useState } from "react";
import { Tag, Check, X, Loader2 } from "lucide-react";

interface ClipAttributes {
  video_id: string | null;
  guest: string | null;
  topic: string | null;
  hook_type: string | null;
  content_angle: string | null;
  clip_length_bucket: string | null;
  cta_type: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

const HOOK_TYPE_OPTIONS = [
  { value: "question",    label: "Frage" },
  { value: "statement",   label: "Statement" },
  { value: "story",       label: "Story" },
  { value: "contrarian",  label: "Kontrovers" },
  { value: "how_to",      label: "How-to" },
  { value: "list",        label: "Liste" },
  { value: "other",       label: "Sonstiges" },
];

const CONTENT_ANGLE_OPTIONS = [
  { value: "educational",    label: "Edukativ" },
  { value: "entertainment",  label: "Unterhaltung" },
  { value: "opinion",        label: "Meinung" },
  { value: "case_study",     label: "Case Study" },
  { value: "behind_scenes",  label: "Hinter den Kulissen" },
  { value: "other",          label: "Sonstiges" },
];

const CLIP_LENGTH_OPTIONS = [
  { value: "under_30s",  label: "< 30 Sek." },
  { value: "30_60s",     label: "30–60 Sek." },
  { value: "60_90s",     label: "60–90 Sek." },
  { value: "90_120s",    label: "90–120 Sek." },
  { value: "over_120s",  label: "> 120 Sek." },
];

const CTA_TYPE_OPTIONS = [
  { value: "subscribe",    label: "Abonnieren" },
  { value: "follow",       label: "Folgen" },
  { value: "link_in_bio",  label: "Link in Bio" },
  { value: "comment",      label: "Kommentar" },
  { value: "share",        label: "Teilen" },
  { value: "podcast_link", label: "Podcast-Link" },
  { value: "none",         label: "Kein CTA" },
  { value: "other",        label: "Sonstiges" },
];

function labelFor(options: { value: string; label: string }[], value: string | null): string | null {
  if (!value) return null;
  return options.find(o => o.value === value)?.label ?? value;
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface FieldEditorProps {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  type: "text" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  saving: boolean;
}

function FieldEditor({ label, value, onChange, type, options, placeholder, saving }: FieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function startEdit() {
    setDraft(value ?? "");
    setEditing(true);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  async function save() {
    const newVal = draft.trim() || null;
    onChange(newVal);
    setEditing(false);
  }

  const displayLabel = type === "select" ? labelFor(options!, value) : value;

  return (
    <div className="group flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1">
          {type === "select" ? (
            <select
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
              className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">— Nicht gesetzt —</option>
              {options!.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder ?? ""}
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs outline-none focus:border-primary"
            />
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            onClick={cancel}
            className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground hover:bg-accent"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="flex-1 text-right text-xs text-foreground hover:text-primary transition-colors min-h-[1.5rem] flex items-center justify-end"
        >
          {displayLabel ? (
            <span className="rounded bg-muted px-2 py-0.5">{displayLabel}</span>
          ) : (
            <span className="text-muted-foreground italic group-hover:text-primary/60">Hinzufügen…</span>
          )}
        </button>
      )}
    </div>
  );
}

export function ClipAttributesPanel({ videoId }: { videoId: string }) {
  const [attrs, setAttrs] = useState<ClipAttributes | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ops/clips/${videoId}/attributes`)
      .then(r => r.json())
      .then(data => {
        setAttrs(data.attributes ?? {
          video_id: videoId, guest: null, topic: null, hook_type: null,
          content_angle: null, clip_length_bucket: null, cta_type: null,
          updated_at: null, updated_by_name: null,
        });
        setLoading(false);
      })
      .catch(() => { setLoading(false); setError("Fehler beim Laden."); });
  }, [videoId]);

  async function updateField(field: string, value: string | null) {
    setSaving(true);
    setError(null);

    // Optimistic update
    setAttrs(prev => prev ? { ...prev, [field]: value } : prev);

    const res = await fetch(`/api/ops/clips/${videoId}/attributes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value ?? "" }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Speichern fehlgeschlagen.");
      // Revert
      setAttrs(prev => prev ? { ...prev, [field]: null } : prev);
    } else {
      const data = await res.json();
      if (data.attributes) setAttrs(data.attributes);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Content-Attribute</span>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const hasAnyAttr = attrs && (
    attrs.guest || attrs.topic || attrs.hook_type ||
    attrs.content_angle || attrs.clip_length_bucket || attrs.cta_type
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Content-Attribute</h2>
        </div>
        {attrs?.updated_by_name && (
          <span className="text-xs text-muted-foreground">
            Bearbeitet von {attrs.updated_by_name} · {formatDateTime(attrs.updated_at)}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {!hasAnyAttr && !saving && (
        <p className="text-xs text-muted-foreground px-3 pb-1">
          Noch keine Attribute gesetzt. Klicke auf ein Feld zum Bearbeiten.
        </p>
      )}

      <div className="divide-y divide-border/50">
        <FieldEditor
          label="Gast"
          value={attrs?.guest ?? null}
          onChange={v => updateField("guest", v)}
          type="text"
          placeholder="z.B. Max Mustermann"
          saving={saving}
        />
        <FieldEditor
          label="Thema / Topic"
          value={attrs?.topic ?? null}
          onChange={v => updateField("topic", v)}
          type="text"
          placeholder="z.B. Marketing, Finanzen…"
          saving={saving}
        />
        <FieldEditor
          label="Hook-Typ"
          value={attrs?.hook_type ?? null}
          onChange={v => updateField("hook_type", v)}
          type="select"
          options={HOOK_TYPE_OPTIONS}
          saving={saving}
        />
        <FieldEditor
          label="Content-Winkel"
          value={attrs?.content_angle ?? null}
          onChange={v => updateField("content_angle", v)}
          type="select"
          options={CONTENT_ANGLE_OPTIONS}
          saving={saving}
        />
        <FieldEditor
          label="Clip-Länge"
          value={attrs?.clip_length_bucket ?? null}
          onChange={v => updateField("clip_length_bucket", v)}
          type="select"
          options={CLIP_LENGTH_OPTIONS}
          saving={saving}
        />
        <FieldEditor
          label="CTA-Typ"
          value={attrs?.cta_type ?? null}
          onChange={v => updateField("cta_type", v)}
          type="select"
          options={CTA_TYPE_OPTIONS}
          saving={saving}
        />
      </div>
    </div>
  );
}
