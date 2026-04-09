"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { Save, CheckCircle } from "lucide-react";

interface ReliabilityScore {
  score: number;
  total_videos: number;
  verified_count: number;
  last_calculated_at: string;
}

interface Profile {
  name: string;
  email: string;
  company_name: string;
  company_address: string;
  tax_id: string;
  iban: string;
  rate_per_view: number;
  reliability_score?: ReliabilityScore | null;
}

export default function CutterProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => data && setProfile(data));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setSaved(false);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name,
        company_name: profile.company_name,
        company_address: profile.company_address,
        tax_id: profile.tax_id,
        iban: profile.iban,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (!profile) return <><CutterNav /><main className="p-6"><p>Laden...</p></main></>;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Profil & Rechnungsdaten</h1>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-semibold">Persönliche Daten</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                value={profile.name}
                onChange={(v) => setProfile({ ...profile, name: v })}
              />
              <Field label="E-Mail" value={profile.email} disabled />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-semibold">Rechnungsdaten</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Diese Daten erscheinen als Absender auf deinen Rechnungen.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Firma / Name"
                value={profile.company_name || ""}
                onChange={(v) => setProfile({ ...profile, company_name: v })}
              />
              <Field
                label="Steuernummer / USt-IdNr."
                value={profile.tax_id || ""}
                onChange={(v) => setProfile({ ...profile, tax_id: v })}
              />
            </div>
            <div className="mt-4">
              <Field
                label="Adresse"
                value={profile.company_address || ""}
                onChange={(v) => setProfile({ ...profile, company_address: v })}
              />
            </div>
            <div className="mt-4">
              <Field
                label="IBAN"
                value={profile.iban || ""}
                onChange={(v) => setProfile({ ...profile, iban: v })}
                placeholder="DE89 3704 0044 0532 0130 00"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-2 font-semibold">Vergütung</h2>
            <p className="text-sm text-muted-foreground">
              Dein aktueller Preis pro View:{" "}
              <span className="font-medium text-foreground">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 4,
                }).format(profile.rate_per_view)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Der Preis wird vom Admin festgelegt und kann nicht selbst geändert
              werden.
            </p>
          </div>

          {/* Reliability Score */}
          {profile.reliability_score !== undefined && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Zuverlässigkeits-Score</h2>
              {profile.reliability_score === null ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Videos vorhanden — Score wird nach dem ersten Video berechnet.
                </p>
              ) : (
                <div className="flex items-center gap-6">
                  <div
                    className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-3xl font-bold ${
                      profile.reliability_score.score >= 80
                        ? "bg-emerald-500/10 text-emerald-400"
                        : profile.reliability_score.score >= 50
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {profile.reliability_score.score}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {profile.reliability_score.verified_count} von{" "}
                      {profile.reliability_score.total_videos} Videos verifiziert
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Zuletzt berechnet:{" "}
                      {new Date(profile.reliability_score.last_calculated_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saved ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Gespeichert
              </>
            ) : saving ? (
              "Wird gespeichert..."
            ) : (
              <>
                <Save className="h-4 w-4" />
                Speichern
              </>
            )}
          </button>
        </form>
      </main>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
    </div>
  );
}
