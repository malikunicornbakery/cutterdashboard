# Cutter Dashboard — Full Project Context

Generated: 2026-04-02 13:54 UTC

## Project Overview

Standalone Next.js 15 app for managing video cutters (editors).
Cutters submit video links, views are scraped daily, invoices are generated based on view deltas.

### Key Features
- Magic Link auth (email-based, no password)
- Video submission with platform account verification + duplicate detection
- Multi-platform view scraping (YouTube API v3, yt-dlp for TikTok/IG/FB)
- Delta-based invoicing (only new views since last invoice)
- DIN 5008 invoice HTML template (German, A4, print-to-PDF)
- Per-cutter individual view rate
- Admin panel for cutter management + recipient company settings

### Tech Stack
- Next.js 15 (App Router, TypeScript)
- Tailwind CSS v4, dark theme only
- SQLite via better-sqlite3
- Lucide React icons
- No external UI library (plain Tailwind components)

### Routes
```
/                  → Redirect to /login
/login             → Magic link login
/dashboard         → KPI cards + recent videos
/videos            → Video list table
/videos/submit     → Submit new video URLs
/accounts          → Link platform accounts (1 per platform)
/invoices          → Invoice list + generate button
/invoices/[id]     → Invoice detail
/profile           → Edit billing info (company, IBAN, tax ID)
/admin             → Manage cutters + recipient settings
```

### API Routes
```
POST /api/auth/send-magic-link
GET  /api/auth/verify?token=xxx
GET  /api/auth/session
POST /api/auth/logout
GET  /api/stats
GET  /api/videos            POST /api/videos
DELETE /api/videos/[id]
GET  /api/accounts          POST /api/accounts
DELETE /api/accounts/[id]
GET  /api/profile           PATCH /api/profile
GET  /api/invoices
POST /api/invoices/generate
GET  /api/invoices/[id]
GET  /api/invoices/[id]/pdf
POST /api/scrape            (cron endpoint)
GET  /api/admin/cutters     POST/PATCH /api/admin/cutters
GET  /api/admin/settings    PUT /api/admin/settings
```

### Database (SQLite)
- File: data/dashboard.db
- Tables: cutters, cutter_sessions, cutter_accounts, cutter_videos, cutter_invoices, cutter_invoice_items, cutter_settings
- Pre-seeded: recipient company = Fabian Tausch, Am Kellerberg 28, 90766 Fürth, DE305676414
- Admin user: fabian@unicornbakery.de

### Invoice Logic
- On 'Generate Invoice': delta_views = current_views - views_at_last_invoice
- amount = delta_views * rate_per_view per video
- After generation: views_at_last_invoice = current_views (reset baseline)
- Sequential invoice numbers: RE-YYYY-NNN
- Sender = cutter's billing data, Recipient = company from cutter_settings
- 30-day payment terms

---

## package.json

```json
{
  "name": "cutter-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.577.0",
    "next": "^15.3.2",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.4",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.15.3",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "tailwindcss": "^4.1.4",
    "typescript": "^5.8.3"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

## postcss.config.mjs

```mjs
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

## .gitignore

```gitignore
node_modules/
.next/
data/
.env.local
```

## src/app/accounts/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { Link2, Trash2, Plus } from "lucide-react";

interface Account {
  id: string;
  platform: string;
  account_handle: string;
  account_url: string | null;
  created_at: string;
}

const PLATFORMS = [
  {
    id: "tiktok",
    label: "TikTok",
    placeholder: "@handle",
    urlPrefix: "https://tiktok.com/@",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  },
  {
    id: "youtube",
    label: "YouTube",
    placeholder: "@channel",
    urlPrefix: "https://youtube.com/@",
    color: "bg-red-500/10 text-red-400 border-red-500/30",
  },
  {
    id: "instagram",
    label: "Instagram",
    placeholder: "@username",
    urlPrefix: "https://instagram.com/",
    color: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  },
  {
    id: "facebook",
    label: "Facebook",
    placeholder: "Seitenname oder URL",
    urlPrefix: "https://facebook.com/",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  },
];

export default function CutterAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [handle, setHandle] = useState("");

  function loadAccounts() {
    fetch("/api/accounts")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => data?.accounts && setAccounts(data.accounts));
  }

  useEffect(() => { loadAccounts(); }, [router]);

  async function handleLink(platform: string) {
    if (!handle.trim()) return;

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        account_handle: handle.trim(),
        account_url: null,
      }),
    });

    if (res.ok) {
      loadAccounts();
      setLinking(null);
      setHandle("");
    } else {
      const data = await res.json();
      alert(data.error || "Fehler");
    }
  }

  async function handleUnlink(id: string) {
    if (!confirm("Konto-Verknüpfung entfernen?")) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) setAccounts((a) => a.filter((x) => x.id !== id));
  }

  const linkedPlatforms = new Set(accounts.map((a) => a.platform));

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-bold">Verknüpfte Konten</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Verknüpfe deine Social-Media-Konten, damit wir prüfen können, dass
          eingereichte Videos auch wirklich von dir stammen. Pro Plattform ist
          ein Konto möglich.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {PLATFORMS.map((p) => {
            const linked = accounts.find((a) => a.platform === p.id);
            const isLinking = linking === p.id;

            return (
              <div
                key={p.id}
                className={`rounded-xl border p-4 ${linked ? p.color : "border-border bg-card"}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">{p.label}</h3>
                  {linked && (
                    <button
                      onClick={() => handleUnlink(linked.id)}
                      className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {linked ? (
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      @{linked.account_handle}
                    </span>
                  </div>
                ) : isLinking ? (
                  <div className="flex gap-2">
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder={p.placeholder}
                      className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleLink(p.id)
                      }
                      autoFocus
                    />
                    <button
                      onClick={() => handleLink(p.id)}
                      className="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                    >
                      OK
                    </button>
                    <button
                      onClick={() => { setLinking(null); setHandle(""); }}
                      className="rounded-lg border border-border px-3 py-1 text-sm"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setLinking(p.id); setHandle(""); }}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Konto verknüpfen
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
```

## src/app/admin/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { Plus, Save, CheckCircle, UserPlus } from "lucide-react";

interface Cutter {
  id: string;
  name: string;
  email: string;
  rate_per_view: number;
  is_active: number;
  is_admin: number;
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
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRate, setNewRate] = useState("0.01");

  function loadAll() {
    fetch("/api/admin/cutters")
      .then((r) => {
        if (r.status === 401 || r.status === 403) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => data?.cutters && setCutters(data.cutters));

    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => data?.settings && setSettings(data.settings));
  }

  useEffect(() => { loadAll(); }, [router]);

  async function handleCreateCutter() {
    if (!newName.trim() || !newEmail.trim()) return;

    const res = await fetch("/api/admin/cutters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        email: newEmail.trim(),
        rate_per_view: parseFloat(newRate) || 0.01,
      }),
    });

    if (res.ok) {
      setShowNew(false);
      setNewName("");
      setNewEmail("");
      setNewRate("0.01");
      loadAll();
    } else {
      const data = await res.json();
      alert(data.error || "Fehler");
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

  async function handleSaveSettings() {
    for (const [key, value] of Object.entries(settings)) {
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
    }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Admin</h1>

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
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="E-Mail"
                  type="email"
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <input
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder="Rate/View"
                  type="number"
                  step="0.001"
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={handleCreateCutter}
                  className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Anlegen
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
                    <th className="px-4 py-3 font-medium text-right">Rate/View</th>
                    <th className="px-4 py-3 font-medium text-right">Videos</th>
                    <th className="px-4 py-3 font-medium text-right">Views</th>
                    <th className="px-4 py-3 font-medium text-right">Abgerechnet</th>
                    <th className="px-4 py-3 font-medium text-center">Aktiv</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cutters.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
                <label className="mb-1 block text-sm font-medium">Firmenname</label>
                <input
                  value={settings.recipient_company_name || ""}
                  onChange={(e) => setSettings({ ...settings, recipient_company_name: e.target.value })}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">USt-IdNr.</label>
                <input
                  value={settings.recipient_tax_id || ""}
                  onChange={(e) => setSettings({ ...settings, recipient_tax_id: e.target.value })}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium">Adresse</label>
              <input
                value={settings.recipient_company_address || ""}
                onChange={(e) => setSettings({ ...settings, recipient_company_address: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={handleSaveSettings}
              className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {settingsSaved ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Gespeichert
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Speichern
                </>
              )}
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
```

## src/app/api/accounts/[id]/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = getDb();

  const account = db
    .prepare(`SELECT id FROM cutter_accounts WHERE id = ? AND cutter_id = ?`)
    .get(id, auth.id);

  if (!account) {
    return NextResponse.json({ error: 'Konto nicht gefunden' }, { status: 404 });
  }

  db.prepare(`DELETE FROM cutter_accounts WHERE id = ?`).run(id);
  return NextResponse.json({ success: true });
}
```

## src/app/api/accounts/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

const VALID_PLATFORMS = ['tiktok', 'youtube', 'instagram', 'facebook'];

export async function GET(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = getDb();
  const accounts = db
    .prepare(`SELECT * FROM cutter_accounts WHERE cutter_id = ? ORDER BY platform`)
    .all(auth.id);

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { platform, account_handle, account_url } = await request.json();

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: 'Ungültige Plattform. Erlaubt: ' + VALID_PLATFORMS.join(', ') },
      { status: 400 }
    );
  }

  if (!account_handle || typeof account_handle !== 'string') {
    return NextResponse.json(
      { error: 'Account-Handle erforderlich' },
      { status: 400 }
    );
  }

  const db = getDb();

  // Check if platform already linked
  const existing = db
    .prepare(`SELECT id FROM cutter_accounts WHERE cutter_id = ? AND platform = ?`)
    .get(auth.id, platform);

  if (existing) {
    return NextResponse.json(
      { error: `Du hast bereits ein ${platform}-Konto verknüpft. Lösche es zuerst, um ein neues zu verknüpfen.` },
      { status: 409 }
    );
  }

  const id = randomUUID();
  const handle = account_handle.trim().replace(/^@/, '').toLowerCase();

  db.prepare(
    `INSERT INTO cutter_accounts (id, cutter_id, platform, account_handle, account_url) VALUES (?, ?, ?, ?, ?)`
  ).run(id, auth.id, platform, handle, account_url || null);

  return NextResponse.json({ id, platform, account_handle: handle });
}
```

## src/app/api/admin/cutters/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAdmin, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = requireCutterAdmin(request);
  if (!isCutter(auth)) return auth;

  const db = getDb();
  const cutters = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM cutter_videos WHERE cutter_id = c.id) as video_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM cutter_invoices WHERE cutter_id = c.id) as total_invoiced,
        (SELECT COALESCE(SUM(current_views), 0) FROM cutter_videos WHERE cutter_id = c.id) as total_views
       FROM cutters c ORDER BY c.created_at DESC`
    )
    .all();

  return NextResponse.json({ cutters });
}

export async function POST(request: NextRequest) {
  const auth = requireCutterAdmin(request);
  if (!isCutter(auth)) return auth;

  const { name, email, rate_per_view } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: 'Name und E-Mail erforderlich' }, { status: 400 });
  }

  const db = getDb();

  // Check duplicate email
  const existing = db.prepare(`SELECT id FROM cutters WHERE email = ?`).get(email.trim().toLowerCase());
  if (existing) {
    return NextResponse.json({ error: 'E-Mail bereits registriert' }, { status: 409 });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO cutters (id, name, email, rate_per_view) VALUES (?, ?, ?, ?)`
  ).run(id, name.trim(), email.trim().toLowerCase(), rate_per_view || 0.01);

  return NextResponse.json({ id, name, email: email.trim().toLowerCase() });
}

export async function PATCH(request: NextRequest) {
  const auth = requireCutterAdmin(request);
  if (!isCutter(auth)) return auth;

  const { id, ...updates } = await request.json();
  if (!id) {
    return NextResponse.json({ error: 'ID erforderlich' }, { status: 400 });
  }

  const db = getDb();
  const allowedFields = ['name', 'email', 'rate_per_view', 'is_active', 'is_admin'];
  const sets: string[] = [];
  const values: (string | number)[] = [];

  for (const field of allowedFields) {
    if (field in updates) {
      sets.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 });
  }

  values.push(id);
  db.prepare(`UPDATE cutters SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json({ success: true });
}
```

## src/app/api/admin/settings/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAdmin, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = requireCutterAdmin(request);
  if (!isCutter(auth)) return auth;

  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM cutter_settings`).all() as Array<{
    key: string;
    value: string;
  }>;

  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const auth = requireCutterAdmin(request);
  if (!isCutter(auth)) return auth;

  const { key, value } = await request.json();

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'Key erforderlich' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO cutter_settings (key, value) VALUES (?, ?)`).run(
    key,
    String(value ?? '')
  );

  return NextResponse.json({ success: true });
}
```

## src/app/api/auth/logout/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { destroySession, clearSessionCookie } from '@/lib/cutter/auth';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('cutter_session')?.value;

  if (token) {
    destroySession(token);
  }

  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}
```

## src/app/api/auth/send-magic-link/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { generateMagicToken } from '@/lib/cutter/auth';
import { sendMagicLinkEmail } from '@/lib/cutter/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'E-Mail-Adresse erforderlich' },
        { status: 400 }
      );
    }

    const token = generateMagicToken(email.trim().toLowerCase());

    if (!token) {
      return NextResponse.json(
        { error: 'E-Mail-Adresse nicht gefunden' },
        { status: 404 }
      );
    }

    await sendMagicLinkEmail(email.trim().toLowerCase(), token);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Magic link error:', err);
    return NextResponse.json(
      { error: 'Interner Fehler' },
      { status: 500 }
    );
  }
}
```

## src/app/api/auth/session/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/cutter/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('cutter_session')?.value;
  const cutter = getSessionFromCookie(token);

  if (!cutter) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  return NextResponse.json({
    id: cutter.id,
    name: cutter.name,
    email: cutter.email,
    company_name: cutter.company_name,
    is_admin: !!cutter.is_admin,
  });
}
```

## src/app/api/auth/verify/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, createSessionCookie } from '@/lib/cutter/auth';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(
      new URL('/login?error=missing_token', request.url)
    );
  }

  const result = verifyMagicToken(token);

  if (!result) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_token', request.url)
    );
  }

  const response = NextResponse.redirect(
    new URL('/dashboard', request.url)
  );

  response.headers.set('Set-Cookie', createSessionCookie(result.sessionToken));

  return response;
}
```

## src/app/api/invoices/[id]/pdf/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';
import { generateInvoiceHtml, type InvoiceTemplateData } from '@/lib/cutter/invoice-template';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_views: number;
  total_amount: number;
  rate_per_view: number;
  sender_company: string;
  recipient_company: string;
  created_at: string;
}

interface ItemRow {
  video_title: string;
  video_url: string;
  platform: string;
  views_in_period: number;
  amount: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = getDb();

  const invoice = db
    .prepare(`SELECT * FROM cutter_invoices WHERE id = ? AND cutter_id = ?`)
    .get(id, auth.id) as InvoiceRow | undefined;

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 });
  }

  const items = db
    .prepare(`SELECT * FROM cutter_invoice_items WHERE invoice_id = ? ORDER BY views_in_period DESC`)
    .all(id) as ItemRow[];

  const sender = JSON.parse(invoice.sender_company || '{}');
  const recipient = JSON.parse(invoice.recipient_company || '{}');

  const templateData: InvoiceTemplateData = {
    invoiceNumber: invoice.invoice_number,
    invoiceDate: formatDate(invoice.created_at),
    periodStart: formatDate(invoice.period_start),
    periodEnd: formatDate(invoice.period_end),
    sender: {
      name: sender.name || auth.name,
      company: sender.name,
      address: sender.address,
      taxId: sender.taxId,
      iban: sender.iban,
    },
    recipient: {
      name: recipient.name || '',
      address: recipient.address,
      taxId: recipient.taxId,
    },
    items: items.map((item, i) => ({
      position: i + 1,
      title: item.video_title,
      platform: item.platform,
      url: item.video_url,
      views: item.views_in_period,
      ratePerView: invoice.rate_per_view,
      amount: item.amount,
    })),
    totalViews: invoice.total_views,
    totalAmount: invoice.total_amount,
    ratePerView: invoice.rate_per_view,
  };

  const html = generateInvoiceHtml(templateData);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
```

## src/app/api/invoices/[id]/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = getDb();

  const invoice = db
    .prepare(`SELECT * FROM cutter_invoices WHERE id = ? AND cutter_id = ?`)
    .get(id, auth.id);

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 });
  }

  const items = db
    .prepare(`SELECT * FROM cutter_invoice_items WHERE invoice_id = ? ORDER BY views_in_period DESC`)
    .all(id);

  return NextResponse.json({ invoice, items });
}
```

## src/app/api/invoices/generate/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/cutter/helpers';

interface VideoRow {
  id: string;
  platform: string;
  url: string;
  title: string | null;
  current_views: number;
  views_at_last_invoice: number;
}

interface SettingRow {
  key: string;
  value: string;
}

export async function POST(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = getDb();

  // Run entire invoice generation inside a transaction
  const result = db.transaction(() => {
    const ratePerView = auth.rate_per_view;

    // Get all videos for this cutter
    const videos = db
      .prepare(`SELECT * FROM cutter_videos WHERE cutter_id = ?`)
      .all(auth.id) as VideoRow[];

    // Calculate deltas
    const billableItems = videos
      .filter((v) => v.current_views > v.views_at_last_invoice)
      .map((v) => ({
        video: v,
        deltaViews: v.current_views - v.views_at_last_invoice,
        amount: (v.current_views - v.views_at_last_invoice) * ratePerView,
      }));

    if (billableItems.length === 0) {
      return { error: 'Keine abrechenbaren Views vorhanden.' };
    }

    const totalViews = billableItems.reduce((s, i) => s + i.deltaViews, 0);
    const totalAmount = billableItems.reduce((s, i) => s + i.amount, 0);

    // Generate sequential invoice number
    const invoiceNumber = generateInvoiceNumber(db);

    // Determine period
    const lastInvoice = db
      .prepare(
        `SELECT period_end FROM cutter_invoices WHERE cutter_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(auth.id) as { period_end: string } | undefined;

    const periodStart = lastInvoice?.period_end || auth.created_at;
    const periodEnd = new Date().toISOString();

    // Get recipient company from settings
    const settings = db
      .prepare(`SELECT key, value FROM cutter_settings WHERE key LIKE 'recipient_%'`)
      .all() as SettingRow[];
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    const recipientCompany = JSON.stringify({
      name: settingsMap['recipient_company_name'] || '',
      address: settingsMap['recipient_company_address'] || '',
      taxId: settingsMap['recipient_tax_id'] || '',
    });

    const senderCompany = JSON.stringify({
      name: auth.company_name || auth.name,
      address: auth.company_address || '',
      taxId: auth.tax_id || '',
      iban: auth.iban || '',
    });

    // Create invoice
    const invoiceId = randomUUID();
    db.prepare(
      `INSERT INTO cutter_invoices (id, cutter_id, invoice_number, period_start, period_end, total_views, total_amount, rate_per_view, status, recipient_company, sender_company)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).run(
      invoiceId,
      auth.id,
      invoiceNumber,
      periodStart,
      periodEnd,
      totalViews,
      totalAmount,
      ratePerView,
      recipientCompany,
      senderCompany
    );

    // Create invoice items
    const insertItem = db.prepare(
      `INSERT INTO cutter_invoice_items (id, invoice_id, video_id, video_title, video_url, platform, views_in_period, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of billableItems) {
      insertItem.run(
        randomUUID(),
        invoiceId,
        item.video.id,
        item.video.title || 'Video',
        item.video.url,
        item.video.platform,
        item.deltaViews,
        item.amount
      );
    }

    // Update views_at_last_invoice for ALL videos (reset baseline)
    db.prepare(
      `UPDATE cutter_videos SET views_at_last_invoice = current_views WHERE cutter_id = ?`
    ).run(auth.id);

    return {
      invoice: {
        id: invoiceId,
        invoice_number: invoiceNumber,
        period_start: periodStart,
        period_end: periodEnd,
        total_views: totalViews,
        total_amount: totalAmount,
        rate_per_view: ratePerView,
        status: 'draft',
        items_count: billableItems.length,
      },
    };
  })();

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
```

## src/app/api/invoices/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = getDb();
  const invoices = db
    .prepare(
      `SELECT * FROM cutter_invoices WHERE cutter_id = ? ORDER BY created_at DESC`
    )
    .all(auth.id);

  return NextResponse.json({ invoices });
}
```

## src/app/api/profile/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  return NextResponse.json({
    id: auth.id,
    name: auth.name,
    email: auth.email,
    company_name: auth.company_name,
    company_address: auth.company_address,
    tax_id: auth.tax_id,
    iban: auth.iban,
    rate_per_view: auth.rate_per_view,
    created_at: auth.created_at,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const body = await request.json();
  const db = getDb();

  const allowedFields = ['name', 'company_name', 'company_address', 'tax_id', 'iban'];
  const updates: string[] = [];
  const values: (string | null)[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field] ?? null);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 });
  }

  values.push(auth.id);
  db.prepare(`UPDATE cutters SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json({ success: true });
}
```

## src/app/api/scrape/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scrapeAllCutterVideos } from '@/lib/cutter/scraper';
import { cleanExpiredSessions } from '@/lib/cutter/auth';

interface VideoRow {
  id: string;
  platform: string;
  external_id: string;
  url: string;
}

export async function POST(request: NextRequest) {
  // Verify cron key
  const cronKey = process.env.CUTTER_CRON_KEY || process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-cron-key');

  if (cronKey && cronHeader !== cronKey && authHeader !== `Bearer ${cronKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // Get all active cutter videos
  const videos = db
    .prepare(
      `SELECT v.id, v.platform, v.external_id, v.url
       FROM cutter_videos v
       JOIN cutters c ON c.id = v.cutter_id
       WHERE c.is_active = 1`
    )
    .all() as VideoRow[];

  if (videos.length === 0) {
    return NextResponse.json({ message: 'No videos to scrape', total: 0 });
  }

  const { updated, failed, results } = await scrapeAllCutterVideos(videos);

  // Batch update in transaction
  const updateStmt = db.prepare(
    `UPDATE cutter_videos SET current_views = ?, title = COALESCE(?, title), last_scraped_at = datetime('now') WHERE id = ?`
  );

  db.transaction(() => {
    for (const result of results) {
      if (result.views !== null) {
        updateStmt.run(result.views, result.title || null, result.id);
      }
    }
  })();

  // Housekeeping
  cleanExpiredSessions();

  return NextResponse.json({
    total: videos.length,
    updated,
    failed,
  });
}
```

## src/app/api/stats/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = getDb();
  const cutterId = auth.id;

  const videoCount = db
    .prepare(`SELECT COUNT(*) as count FROM cutter_videos WHERE cutter_id = ?`)
    .get(cutterId) as { count: number };

  const totalViews = db
    .prepare(`SELECT COALESCE(SUM(current_views), 0) as total FROM cutter_videos WHERE cutter_id = ?`)
    .get(cutterId) as { total: number };

  const totalEarnings = db
    .prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM cutter_invoices WHERE cutter_id = ?`)
    .get(cutterId) as { total: number };

  const earnings30d = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM cutter_invoices
       WHERE cutter_id = ? AND created_at > datetime('now', '-30 days')`
    )
    .get(cutterId) as { total: number };

  const unbilledViews = db
    .prepare(
      `SELECT COALESCE(SUM(current_views - views_at_last_invoice), 0) as total
       FROM cutter_videos WHERE cutter_id = ? AND current_views > views_at_last_invoice`
    )
    .get(cutterId) as { total: number };

  const unbilledAmount = unbilledViews.total * auth.rate_per_view;

  return NextResponse.json({
    videoCount: videoCount.count,
    totalViews: totalViews.total,
    totalEarnings: totalEarnings.total,
    earnings30d: earnings30d.total,
    unbilledViews: unbilledViews.total,
    unbilledAmount,
    ratePerView: auth.rate_per_view,
  });
}
```

## src/app/api/videos/[id]/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = getDb();

  // Only allow deleting own videos
  const video = db
    .prepare(`SELECT id FROM cutter_videos WHERE id = ? AND cutter_id = ?`)
    .get(id, auth.id);

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Don't allow deleting videos that have been invoiced
  const invoiced = db
    .prepare(`SELECT id FROM cutter_invoice_items WHERE video_id = ? LIMIT 1`)
    .get(id);

  if (invoiced) {
    return NextResponse.json(
      { error: 'Video kann nicht gelöscht werden — bereits in einer Rechnung enthalten' },
      { status: 400 }
    );
  }

  db.prepare(`DELETE FROM cutter_videos WHERE id = ?`).run(id);
  return NextResponse.json({ success: true });
}
```

## src/app/api/videos/route.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { getDb } from '@/lib/db';
import { parsePlatformUrl } from '@/lib/cutter/helpers';
import { scrapeVideoViews } from '@/lib/cutter/scraper';

export async function GET(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = getDb();
  const videos = db
    .prepare(
      `SELECT *, (current_views - views_at_last_invoice) as unbilled_views
       FROM cutter_videos WHERE cutter_id = ? ORDER BY created_at DESC`
    )
    .all(auth.id);

  return NextResponse.json({ videos });
}

export async function POST(request: NextRequest) {
  const auth = requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { urls } = await request.json();

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'URLs erforderlich' }, { status: 400 });
  }

  if (urls.length > 50) {
    return NextResponse.json({ error: 'Maximal 50 URLs pro Anfrage' }, { status: 400 });
  }

  const db = getDb();
  const accepted: Array<{ id: string; url: string; platform: string }> = [];
  const rejected: Array<{ url: string; reason: string }> = [];

  // Load cutter's verified accounts
  const accounts = db
    .prepare(`SELECT platform, account_handle FROM cutter_accounts WHERE cutter_id = ?`)
    .all(auth.id) as Array<{ platform: string; account_handle: string }>;

  const accountMap = new Map(accounts.map((a) => [a.platform, a.account_handle.toLowerCase()]));

  for (const rawUrl of urls) {
    const url = (rawUrl as string).trim();
    if (!url) continue;

    // 1. Parse URL
    const parsed = parsePlatformUrl(url);
    if (!parsed) {
      rejected.push({ url, reason: 'URL-Format nicht erkannt' });
      continue;
    }

    // 2. Check account verification
    const verifiedHandle = accountMap.get(parsed.platform);
    if (!verifiedHandle) {
      rejected.push({
        url,
        reason: `Kein ${parsed.platform}-Konto verknüpft. Bitte zuerst unter "Konten" verknüpfen.`,
      });
      continue;
    }

    // If we can extract account handle from URL, verify it matches
    if (parsed.accountHandle) {
      if (parsed.accountHandle.toLowerCase() !== verifiedHandle) {
        rejected.push({
          url,
          reason: `Video gehört zu @${parsed.accountHandle}, nicht zu deinem verknüpften Konto @${verifiedHandle}`,
        });
        continue;
      }
    }

    // 3. Check for duplicates
    const existing = db
      .prepare(`SELECT id, cutter_id FROM cutter_videos WHERE platform = ? AND external_id = ?`)
      .get(parsed.platform, parsed.externalId) as { id: string; cutter_id: string } | undefined;

    if (existing) {
      const dupMsg =
        existing.cutter_id === auth.id
          ? 'Video bereits eingereicht'
          : 'Video wurde bereits von einem anderen Cutter eingereicht';
      rejected.push({ url, reason: dupMsg });
      continue;
    }

    // 4. Insert video
    const videoId = randomUUID();
    db.prepare(
      `INSERT INTO cutter_videos (id, cutter_id, platform, external_id, url, account_handle, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(videoId, auth.id, parsed.platform, parsed.externalId, url, parsed.accountHandle);

    accepted.push({ id: videoId, url, platform: parsed.platform });

    // 5. Initial scrape (best-effort, don't fail the submission)
    try {
      const scraped = await scrapeVideoViews(parsed.platform, parsed.externalId, url);
      if (scraped) {
        db.prepare(
          `UPDATE cutter_videos SET current_views = ?, title = ?, first_scraped_at = datetime('now'), last_scraped_at = datetime('now')
           WHERE id = ?`
        ).run(scraped.views, scraped.title || null, videoId);
      }
    } catch (err) {
      console.warn(`Initial scrape failed for ${url}:`, err);
    }
  }

  return NextResponse.json({ accepted, rejected });
}
```

## src/app/dashboard/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Eye,
  Video,
  Euro,
  TrendingUp,
  Clock,
  Plus,
  Receipt,
} from "lucide-react";

interface Stats {
  videoCount: number;
  totalViews: number;
  totalEarnings: number;
  earnings30d: number;
  unbilledViews: number;
  unbilledAmount: number;
  ratePerView: number;
}

interface VideoRow {
  id: string;
  platform: string;
  url: string;
  title: string | null;
  current_views: number;
  unbilled_views: number;
  created_at: string;
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

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export default function CutterDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((data) => data && setStats(data));

    fetch("/api/videos")
      .then((r) => r.json())
      .then((data) => data.videos && setVideos(data.videos.slice(0, 5)));
  }, [router]);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex gap-2">
            <Link
              href="/videos/submit"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Videos einreichen
            </Link>
            <Link
              href="/invoices"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <Receipt className="h-4 w-4" />
              Rechnungen
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        {stats && (
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              icon={<Video className="h-5 w-5" />}
              label="Videos"
              value={formatNum(stats.videoCount)}
            />
            <StatCard
              icon={<Eye className="h-5 w-5" />}
              label="Gesamte Views"
              value={formatNum(stats.totalViews)}
            />
            <StatCard
              icon={<Euro className="h-5 w-5" />}
              label="Gesamtverdienst"
              value={formatEur(stats.totalEarnings)}
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Letzte 30 Tage"
              value={formatEur(stats.earnings30d)}
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              label="Nicht abgerechnet"
              value={`${formatNum(stats.unbilledViews)} Views`}
              sub={formatEur(stats.unbilledAmount)}
              highlight
            />
          </div>
        )}

        {/* Recent Videos */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="font-semibold">Letzte Videos</h2>
            <Link
              href="/videos"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Alle anzeigen
            </Link>
          </div>
          {videos.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Noch keine Videos eingereicht.{" "}
              <Link
                href="/videos/submit"
                className="text-primary hover:underline"
              >
                Jetzt starten
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {videos.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {v.title || v.url}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] || "bg-muted text-muted-foreground"}`}
                      >
                        {PLATFORM_LABELS[v.platform] || v.platform}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatNum(v.current_views)} Views
                    </p>
                    {v.unbilled_views > 0 && (
                      <p className="text-xs text-emerald-400">
                        +{formatNum(v.unbilled_views)} neu
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border bg-card"
      }`}
    >
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-emerald-400">{sub}</p>}
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
```

## src/app/globals.css

```css
@import "tailwindcss";

@theme {
  --color-background: oklch(0.145 0 0);
  --color-foreground: oklch(0.985 0 0);
  --color-card: oklch(0.205 0 0);
  --color-card-foreground: oklch(0.985 0 0);
  --color-popover: oklch(0.205 0 0);
  --color-popover-foreground: oklch(0.985 0 0);
  --color-primary: oklch(0.922 0 0);
  --color-primary-foreground: oklch(0.205 0 0);
  --color-secondary: oklch(0.269 0 0);
  --color-secondary-foreground: oklch(0.922 0 0);
  --color-muted: oklch(0.269 0 0);
  --color-muted-foreground: oklch(0.708 0 0);
  --color-accent: oklch(0.269 0 0);
  --color-accent-foreground: oklch(0.922 0 0);
  --color-destructive: oklch(0.704 0.191 22.216);
  --color-destructive-foreground: oklch(0.922 0 0);
  --color-border: oklch(0.269 0 0);
  --color-input: oklch(0.269 0 0);
  --color-ring: oklch(0.556 0 0);
  --radius: 0.625rem;
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
}

body {
  font-family: var(--font-sans);
}
```

## src/app/invoices/[id]/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { ArrowLeft, FileText, ExternalLink } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_views: number;
  total_amount: number;
  rate_per_view: number;
  status: string;
  sender_company: string;
  recipient_company: string;
  created_at: string;
}

interface InvoiceItem {
  id: string;
  video_title: string;
  video_url: string;
  platform: string;
  views_in_period: number;
  amount: number;
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE");
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-yellow-500/10 text-yellow-400" },
  sent: { label: "Gesendet", color: "bg-blue-500/10 text-blue-400" },
  paid: { label: "Bezahlt", color: "bg-emerald-500/10 text-emerald-400" },
};

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/invoices/${params.id}`)
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        if (!r.ok) { router.push("/invoices"); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setInvoice(data.invoice);
          setItems(data.items);
        }
      });
  }, [params.id, router]);

  if (!invoice) {
    return (
      <>
        <CutterNav />
        <main className="p-6"><p>Laden...</p></main>
      </>
    );
  }

  const status = STATUS_MAP[invoice.status] || STATUS_MAP.draft;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl p-6">
        <Link
          href="/invoices"
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Alle Rechnungen
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Erstellt am {formatDate(invoice.created_at)} &middot; Zeitraum{" "}
              {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded px-2.5 py-1 text-xs font-medium ${status.color}`}>
              {status.label}
            </span>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <FileText className="h-4 w-4" />
              PDF anzeigen
            </a>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Views</p>
            <p className="text-xl font-bold">{formatNum(invoice.total_views)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Preis/View</p>
            <p className="text-xl font-bold">
              {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 4 }).format(invoice.rate_per_view)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-xs text-muted-foreground">Gesamtbetrag</p>
            <p className="text-xl font-bold text-emerald-400">{formatEur(invoice.total_amount)}</p>
          </div>
        </div>

        {/* Line Items */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-semibold">Positionen ({items.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium w-12">#</th>
                  <th className="px-4 py-3 font-medium">Video</th>
                  <th className="px-4 py-3 font-medium">Plattform</th>
                  <th className="px-4 py-3 font-medium text-right">Views</th>
                  <th className="px-4 py-3 font-medium text-right">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, i) => (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="max-w-sm px-4 py-3">
                      <p className="truncate font-medium">{item.video_title}</p>
                      <a
                        href={item.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                      >
                        {item.video_url}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[item.platform] || "bg-muted"}`}
                      >
                        {PLATFORM_LABELS[item.platform] || item.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatNum(item.views_in_period)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatEur(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
```

## src/app/invoices/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { Receipt, Plus, FileText } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_views: number;
  total_amount: number;
  rate_per_view: number;
  status: string;
  created_at: string;
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE");
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-yellow-500/10 text-yellow-400" },
  sent: { label: "Gesendet", color: "bg-blue-500/10 text-blue-400" },
  paid: { label: "Bezahlt", color: "bg-emerald-500/10 text-emerald-400" },
};

export default function CutterInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [generating, setGenerating] = useState(false);

  function loadInvoices() {
    fetch("/api/invoices")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => data?.invoices && setInvoices(data.invoices));
  }

  useEffect(() => { loadInvoices(); }, [router]);

  async function handleGenerate() {
    if (!confirm("Rechnung generieren? Alle aktuellen Views werden als abgerechnet markiert.")) return;

    setGenerating(true);
    const res = await fetch("/api/invoices/generate", { method: "POST" });
    const data = await res.json();
    setGenerating(false);

    if (res.ok) {
      loadInvoices();
      router.push(`/invoices/${data.invoice.id}`);
    } else {
      alert(data.error || "Fehler bei der Rechnungserstellung");
    }
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Rechnungen</h1>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {generating ? "Wird erstellt..." : "Rechnung generieren"}
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card">
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Noch keine Rechnungen erstellt.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Nr.</th>
                    <th className="px-4 py-3 font-medium">Zeitraum</th>
                    <th className="px-4 py-3 font-medium text-right">Views</th>
                    <th className="px-4 py-3 font-medium text-right">Betrag</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Erstellt</th>
                    <th className="px-4 py-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => {
                    const s = STATUS_LABELS[inv.status] || STATUS_LABELS.draft;
                    return (
                      <tr key={inv.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                        </td>
                        <td className="px-4 py-3 text-right">{formatNum(inv.total_views)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatEur(inv.total_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.created_at)}</td>
                        <td className="px-4 py-3">
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                            title="PDF anzeigen"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
```

## src/app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cutter Dashboard",
  description: "Video-Cutter Verwaltung & Rechnungen",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
```

## src/app/login/page.tsx

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Scissors, Mail, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";

export default function CutterLoginPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (res.ok) {
        setStatus("sent");
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Ein Fehler ist aufgetreten");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Verbindungsfehler");
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Scissors className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Cutter Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Melde dich mit deiner E-Mail an
          </p>
        </div>

        {/* Error from redirect */}
        {error && status === "idle" && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error === "invalid_token"
              ? "Der Login-Link ist ungültig oder abgelaufen."
              : "Ein Fehler ist aufgetreten."}
          </div>
        )}

        {/* Sent state */}
        {status === "sent" ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
            <h2 className="font-semibold">Link gesendet!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ein Login-Link wurde an{" "}
              <span className="font-medium text-foreground">{email}</span>{" "}
              gesendet. Prüfe dein Postfach.
            </p>
            <button
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Andere E-Mail verwenden
            </button>
          </div>
        ) : (
          /* Login form */
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-border bg-card p-6"
          >
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium"
            >
              E-Mail-Adresse
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                required
                className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {status === "error" && errorMsg && (
              <p className="mt-2 text-sm text-destructive">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading" || !email.trim()}
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "loading" ? (
                "Wird gesendet..."
              ) : (
                <>
                  Magic Link senden
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

## src/app/page.tsx

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
```

## src/app/profile/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { Save, CheckCircle } from "lucide-react";

interface Profile {
  name: string;
  email: string;
  company_name: string;
  company_address: string;
  tax_id: string;
  iban: string;
  rate_per_view: number;
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
```

## src/app/videos/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { Plus, Trash2, ExternalLink, RefreshCw } from "lucide-react";

interface VideoRow {
  id: string;
  platform: string;
  external_id: string;
  url: string;
  title: string | null;
  account_handle: string | null;
  current_views: number;
  views_at_last_invoice: number;
  unbilled_views: number;
  last_scraped_at: string | null;
  created_at: string;
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

  useEffect(() => { loadVideos(); }, [router]);

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
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Videos</h1>
          <div className="flex gap-2">
            <button
              onClick={loadVideos}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/videos/submit"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Einreichen
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          {videos.length === 0 && !loading ? (
            <div className="p-12 text-center text-muted-foreground">
              Keine Videos vorhanden.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Video</th>
                    <th className="px-4 py-3 font-medium">Plattform</th>
                    <th className="px-4 py-3 font-medium text-right">Views</th>
                    <th className="px-4 py-3 font-medium text-right">Nicht abgerechnet</th>
                    <th className="px-4 py-3 font-medium">Eingereicht</th>
                    <th className="px-4 py-3 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {videos.map((v) => (
                    <tr key={v.id} className="hover:bg-muted/30">
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-medium">
                          {v.title || "Ohne Titel"}
                        </p>
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                        >
                          {v.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] || "bg-muted"}`}
                        >
                          {PLATFORM_LABELS[v.platform] || v.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatNum(v.current_views)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {v.unbilled_views > 0 ? (
                          <span className="font-medium text-emerald-400">
                            +{formatNum(v.unbilled_views)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(v.created_at).toLocaleDateString("de-DE")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Entfernen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
```

## src/app/videos/submit/page.tsx

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { ArrowLeft, Send, CheckCircle, XCircle } from "lucide-react";

interface Result {
  accepted: Array<{ id: string; url: string; platform: string }>;
  rejected: Array<{ url: string; reason: string }>;
}

export default function SubmitVideosPage() {
  const router = useRouter();
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!urls.trim()) return;

    setLoading(true);
    setResult(null);

    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      setResult(data);

      if (data.accepted?.length > 0 && data.rejected?.length === 0) {
        setUrls("");
      }
    } catch {
      alert("Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-2xl p-6">
        <Link
          href="/videos"
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Videos
        </Link>

        <h1 className="mb-6 text-2xl font-bold">Videos einreichen</h1>

        <form onSubmit={handleSubmit}>
          <div className="rounded-xl border border-border bg-card p-5">
            <label className="mb-2 block text-sm font-medium">
              Video-URLs (eine pro Zeile)
            </label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows={8}
              placeholder={`https://www.tiktok.com/@handle/video/123456\nhttps://youtube.com/shorts/abc123\nhttps://www.instagram.com/reel/xyz789/`}
              className="w-full rounded-lg border border-input bg-background p-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Unterstützt: TikTok, YouTube, Instagram, Facebook. Maximal 50 URLs
              pro Anfrage.
            </p>

            <button
              type="submit"
              disabled={loading || !urls.trim()}
              className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                "Wird verarbeitet..."
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Einreichen
                </>
              )}
            </button>
          </div>
        </form>

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-4">
            {result.accepted.length > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h3 className="mb-2 flex items-center gap-2 font-medium text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                  {result.accepted.length} Video(s) erfolgreich eingereicht
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.accepted.map((a) => (
                    <li key={a.id} className="truncate">
                      <span className="font-medium text-foreground">
                        {a.platform}
                      </span>{" "}
                      — {a.url}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.rejected.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <h3 className="mb-2 flex items-center gap-2 font-medium text-destructive">
                  <XCircle className="h-4 w-4" />
                  {result.rejected.length} Video(s) abgelehnt
                </h3>
                <ul className="space-y-2 text-sm">
                  {result.rejected.map((r, i) => (
                    <li key={i}>
                      <p className="truncate text-muted-foreground">{r.url}</p>
                      <p className="text-destructive">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
```

## src/components/cutter-nav.tsx

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Video,
  Receipt,
  Link2,
  User,
  Settings,
  LogOut,
  Scissors,
} from "lucide-react";

interface CutterSession {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/videos", label: "Videos", icon: Video },
  { href: "/invoices", label: "Rechnungen", icon: Receipt },
  { href: "/accounts", label: "Konten", icon: Link2 },
  { href: "/profile", label: "Profil", icon: User },
];

export function CutterNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<CutterSession | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) setSession(data);
        else router.push("/login");
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!session) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold text-foreground"
        >
          <Scissors className="h-5 w-5" />
          <span>Cutter</span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {session.is_admin && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <Settings className="h-4 w-4" />
              Admin
            </Link>
          )}
        </nav>

        {/* User + Logout */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{session.name}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
```

## src/lib/cutter/auth.ts

```ts
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';

export interface CutterRow {
  id: string;
  name: string;
  email: string;
  company_name: string | null;
  company_address: string | null;
  tax_id: string | null;
  iban: string | null;
  rate_per_view: number;
  is_admin: number;
  is_active: number;
  created_at: string;
}

// ─── Magic Link ────────────────────────────────────────────────────

export function generateMagicToken(email: string): string | null {
  const db = getDb();
  const cutter = db
    .prepare(`SELECT id FROM cutters WHERE email = ? AND is_active = 1`)
    .get(email) as { id: string } | undefined;

  if (!cutter) return null;

  const token = randomUUID();
  db.prepare(
    `UPDATE cutters SET magic_token = ?, token_expires_at = datetime('now', '+15 minutes') WHERE id = ?`
  ).run(token, cutter.id);

  return token;
}

export function verifyMagicToken(
  token: string
): { sessionToken: string; cutter: CutterRow } | null {
  const db = getDb();
  const cutter = db
    .prepare(
      `SELECT * FROM cutters WHERE magic_token = ? AND token_expires_at > datetime('now') AND is_active = 1`
    )
    .get(token) as CutterRow | undefined;

  if (!cutter) return null;

  // Clear magic token
  db.prepare(
    `UPDATE cutters SET magic_token = NULL, token_expires_at = NULL WHERE id = ?`
  ).run(cutter.id);

  // Create session (30 days)
  const sessionToken = randomUUID();
  const sessionId = randomUUID();
  db.prepare(
    `INSERT INTO cutter_sessions (id, cutter_id, token, expires_at) VALUES (?, ?, ?, datetime('now', '+30 days'))`
  ).run(sessionId, cutter.id, sessionToken);

  return { sessionToken, cutter };
}

// ─── Session Management ────────────────────────────────────────────

export function getSessionFromCookie(
  cookieValue: string | undefined
): CutterRow | null {
  if (!cookieValue) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.* FROM cutters c
       JOIN cutter_sessions s ON s.cutter_id = c.id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND c.is_active = 1`
    )
    .get(cookieValue) as CutterRow | undefined;

  return row ?? null;
}

export function createSessionCookie(sessionToken: string): string {
  return `cutter_session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
}

export function clearSessionCookie(): string {
  return `cutter_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function destroySession(token: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM cutter_sessions WHERE token = ?`).run(token);
}

// ─── Cleanup ───────────────────────────────────────────────────────

export function cleanExpiredSessions(): void {
  const db = getDb();
  db.prepare(`DELETE FROM cutter_sessions WHERE expires_at < datetime('now')`).run();
}
```

## src/lib/cutter/email.ts

```ts
/**
 * Send a magic link email to the cutter.
 *
 * MVP: Logs the link to console. Replace with Resend/Nodemailer for production.
 */
export async function sendMagicLinkEmail(
  email: string,
  token: string
): Promise<void> {
  const baseUrl = process.env.CUTTER_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const link = `${baseUrl}/api/auth/verify?token=${token}`;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Magic Link für:', email);
  console.log('🔗', link);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // TODO: Production email integration
  // import { Resend } from 'resend';
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'Cutter Dashboard <noreply@yourdomain.com>',
  //   to: email,
  //   subject: 'Dein Login-Link',
  //   html: `<p>Klicke <a href="${link}">hier</a> um dich einzuloggen. Der Link ist 15 Minuten gültig.</p>`,
  // });
}
```

## src/lib/cutter/helpers.ts

```ts
import type Database from 'better-sqlite3';

export interface ParsedUrl {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
  externalId: string;
  accountHandle: string | null;
}

/**
 * Parse a social media video URL into platform, external ID, and account handle.
 */
export function parsePlatformUrl(url: string): ParsedUrl | null {
  try {
    // Normalize: remove tracking params, trim whitespace
    const cleaned = url.trim();
    const u = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');

    // YouTube: youtube.com/watch?v=X, youtu.be/X, youtube.com/shorts/X
    if (host === 'youtube.com' || host === 'youtu.be') {
      let videoId: string | null = null;

      if (host === 'youtu.be') {
        videoId = u.pathname.slice(1).split('/')[0];
      } else if (u.pathname.startsWith('/watch')) {
        videoId = u.searchParams.get('v');
      } else if (u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.split('/shorts/')[1]?.split('/')[0];
      }

      if (videoId) {
        return { platform: 'youtube', externalId: videoId, accountHandle: null };
      }
    }

    // TikTok: tiktok.com/@handle/video/ID
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      const match = u.pathname.match(/@([^/]+)\/video\/(\d+)/);
      if (match) {
        return {
          platform: 'tiktok',
          externalId: match[2],
          accountHandle: match[1],
        };
      }
      // Short URL: vm.tiktok.com/XXX — can't extract ID without following redirect
      // Try tiktok.com/t/XXX format
      const shortMatch = u.pathname.match(/\/(?:t\/)?(\w+)/);
      if (host === 'vm.tiktok.com' && shortMatch) {
        return {
          platform: 'tiktok',
          externalId: shortMatch[1],
          accountHandle: null,
        };
      }
    }

    // Instagram: instagram.com/reel/CODE/, instagram.com/p/CODE/
    if (host === 'instagram.com') {
      const match = u.pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
      if (match) {
        return {
          platform: 'instagram',
          externalId: match[2],
          accountHandle: null,
        };
      }
    }

    // Facebook: facebook.com/reel/ID, facebook.com/watch/?v=ID, fb.watch/X
    if (host === 'facebook.com' || host === 'fb.watch') {
      if (host === 'fb.watch') {
        const fbId = u.pathname.slice(1).split('/')[0];
        if (fbId) {
          return { platform: 'facebook', externalId: fbId, accountHandle: null };
        }
      }

      const reelMatch = u.pathname.match(/\/reel\/(\d+)/);
      if (reelMatch) {
        return { platform: 'facebook', externalId: reelMatch[1], accountHandle: null };
      }

      const watchV = u.searchParams.get('v');
      if (u.pathname.startsWith('/watch') && watchV) {
        return { platform: 'facebook', externalId: watchV, accountHandle: null };
      }

      // facebook.com/username/videos/ID
      const videoMatch = u.pathname.match(/\/videos\/(\d+)/);
      if (videoMatch) {
        return { platform: 'facebook', externalId: videoMatch[1], accountHandle: null };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Generate the next sequential invoice number in format RE-YYYY-NNN.
 */
export function generateInvoiceNumber(db: Database.Database): string {
  const year = new Date().getFullYear();
  const prefix = `RE-${year}-`;

  const last = db
    .prepare(
      `SELECT invoice_number FROM cutter_invoices
       WHERE invoice_number LIKE ? || '%'
       ORDER BY invoice_number DESC LIMIT 1`
    )
    .get(prefix) as { invoice_number: string } | undefined;

  let counter = 1;
  if (last) {
    const num = parseInt(last.invoice_number.replace(prefix, ''), 10);
    if (!isNaN(num)) counter = num + 1;
  }

  return `${prefix}${String(counter).padStart(3, '0')}`;
}

/**
 * Format a number as EUR currency (German locale).
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Format a number with German locale (dot thousands separator).
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n);
}
```

## src/lib/cutter/invoice-template.ts

```ts
import { formatCurrency, formatNumber } from './helpers';

export interface InvoiceTemplateData {
  invoiceNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  sender: {
    name: string;
    company?: string;
    address?: string;
    taxId?: string;
    iban?: string;
  };
  recipient: {
    name: string;
    address?: string;
    taxId?: string;
  };
  items: Array<{
    position: number;
    title: string;
    platform: string;
    url: string;
    views: number;
    ratePerView: number;
    amount: number;
  }>;
  totalViews: number;
  totalAmount: number;
  ratePerView: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

export function generateInvoiceHtml(data: InvoiceTemplateData): string {
  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.position}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">
          <div style="font-size: 13px;">${escapeHtml(item.title || 'Video')}</div>
          <div style="font-size: 11px; color: #888; margin-top: 2px;">${escapeHtml(item.url)}</div>
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${PLATFORM_LABELS[item.platform] || item.platform}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatNumber(item.views)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.ratePerView)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 500;">${formatCurrency(item.amount)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rechnung ${escapeHtml(data.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
    }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm; }
    @media print {
      .page { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; padding: 16px; background: #f5f5f5; border-bottom: 1px solid #ddd;">
    <button onclick="window.print()" style="padding: 8px 24px; background: #18181b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
      Als PDF drucken
    </button>
  </div>

  <div class="page">
    <!-- Sender header -->
    <div style="margin-bottom: 40px;">
      <div style="font-size: 18px; font-weight: 700;">${escapeHtml(data.sender.company || data.sender.name)}</div>
      ${data.sender.address ? `<div style="color: #666; font-size: 12px; margin-top: 4px;">${escapeHtml(data.sender.address)}</div>` : ''}
      ${data.sender.taxId ? `<div style="color: #666; font-size: 12px;">USt-IdNr.: ${escapeHtml(data.sender.taxId)}</div>` : ''}
    </div>

    <!-- Sender line (DIN 5008) -->
    <div style="font-size: 9px; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 4px;">
      ${escapeHtml(data.sender.name)}${data.sender.address ? ` · ${escapeHtml(data.sender.address)}` : ''}
    </div>

    <!-- Recipient -->
    <div style="margin-bottom: 32px;">
      <div style="font-weight: 500;">${escapeHtml(data.recipient.name)}</div>
      ${data.recipient.address ? `<div>${escapeHtml(data.recipient.address)}</div>` : ''}
      ${data.recipient.taxId ? `<div>USt-IdNr.: ${escapeHtml(data.recipient.taxId)}</div>` : ''}
    </div>

    <!-- Invoice metadata -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
      <div>
        <div style="font-size: 22px; font-weight: 700;">Rechnung</div>
      </div>
      <div style="text-align: right; font-size: 13px;">
        <div><strong>Rechnungsnr.:</strong> ${escapeHtml(data.invoiceNumber)}</div>
        <div><strong>Datum:</strong> ${escapeHtml(data.invoiceDate)}</div>
        <div><strong>Leistungszeitraum:</strong> ${escapeHtml(data.periodStart)} – ${escapeHtml(data.periodEnd)}</div>
      </div>
    </div>

    <!-- Line items -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 50px;">Nr.</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd;">Beschreibung</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 90px;">Plattform</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 90px;">Views</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 90px;">Preis/View</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; width: 100px;">Betrag</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding: 12px;"></td>
          <td style="padding: 12px; text-align: right; font-weight: 600; border-top: 2px solid #1a1a1a;">${formatNumber(data.totalViews)}</td>
          <td style="padding: 12px; border-top: 2px solid #1a1a1a;"></td>
          <td style="padding: 12px; text-align: right; font-weight: 700; font-size: 15px; border-top: 2px solid #1a1a1a;">${formatCurrency(data.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Tax note -->
    <div style="font-size: 12px; color: #666; margin-bottom: 32px; padding: 12px; background: #fafafa; border-radius: 4px;">
      Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
    </div>

    <!-- Payment info -->
    <div style="margin-bottom: 32px;">
      <div style="font-weight: 600; margin-bottom: 8px;">Zahlungsinformationen</div>
      <div style="font-size: 13px;">
        Bitte überweisen Sie den Betrag von <strong>${formatCurrency(data.totalAmount)}</strong>
        innerhalb von <strong>30 Tagen</strong> auf folgendes Konto:
      </div>
      ${data.sender.iban ? `<div style="margin-top: 8px; font-size: 13px;"><strong>IBAN:</strong> ${escapeHtml(data.sender.iban)}</div>` : ''}
      <div style="margin-top: 4px; font-size: 13px;"><strong>Kontoinhaber:</strong> ${escapeHtml(data.sender.company || data.sender.name)}</div>
      <div style="margin-top: 4px; font-size: 13px;"><strong>Verwendungszweck:</strong> ${escapeHtml(data.invoiceNumber)}</div>
    </div>

    <!-- Footer -->
    <div style="font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
      ${escapeHtml(data.sender.company || data.sender.name)}${data.sender.address ? ` · ${escapeHtml(data.sender.address)}` : ''}${data.sender.taxId ? ` · USt-IdNr.: ${escapeHtml(data.sender.taxId)}` : ''}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

## src/lib/cutter/middleware.ts

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie, type CutterRow } from './auth';

/**
 * Require cutter authentication for an API route.
 * Returns the cutter row if authenticated, or a 401 JSON response.
 */
export function requireCutterAuth(
  request: NextRequest
): CutterRow | NextResponse {
  const token = request.cookies.get('cutter_session')?.value;
  const cutter = getSessionFromCookie(token);

  if (!cutter) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  return cutter;
}

/**
 * Require admin-level cutter authentication.
 */
export function requireCutterAdmin(
  request: NextRequest
): CutterRow | NextResponse {
  const result = requireCutterAuth(request);
  if (result instanceof NextResponse) return result;

  if (!result.is_admin) {
    return NextResponse.json({ error: 'Kein Admin-Zugang' }, { status: 403 });
  }

  return result;
}

/**
 * Type guard: check if the result is a cutter (not an error response).
 */
export function isCutter(
  result: CutterRow | NextResponse
): result is CutterRow {
  return !(result instanceof NextResponse);
}
```

## src/lib/cutter/scraper.ts

```ts
import { execSync } from 'child_process';

const YT_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

/**
 * Scrape view count for a single video.
 * Returns the view count or null if scraping failed.
 */
export async function scrapeVideoViews(
  platform: string,
  externalId: string,
  url: string
): Promise<{ views: number; title?: string } | null> {
  try {
    switch (platform) {
      case 'youtube':
        return await scrapeYouTube(externalId);
      case 'tiktok':
        return await scrapeWithYtDlp(url);
      case 'instagram':
        return await scrapeWithYtDlp(url);
      case 'facebook':
        return await scrapeWithYtDlp(url);
      default:
        return null;
    }
  } catch (err) {
    console.error(`Scrape failed for ${platform}/${externalId}:`, err);
    return null;
  }
}

/**
 * YouTube: Use the Data API v3 for reliable view counts.
 */
async function scrapeYouTube(
  videoId: string
): Promise<{ views: number; title?: string } | null> {
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=statistics,snippet&key=${YT_API_KEY}`;

  const res = await fetch(apiUrl);
  if (!res.ok) {
    console.error('YouTube API error:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  return {
    views: parseInt(item.statistics.viewCount, 10) || 0,
    title: item.snippet?.title,
  };
}

/**
 * TikTok / Instagram / Facebook: Use yt-dlp to extract metadata.
 * Falls back gracefully if yt-dlp is not installed.
 */
async function scrapeWithYtDlp(
  url: string
): Promise<{ views: number; title?: string } | null> {
  try {
    const output = execSync(
      `yt-dlp --dump-json --no-download "${url}" 2>/dev/null`,
      { timeout: 30000, encoding: 'utf-8' }
    );

    const data = JSON.parse(output);
    return {
      views: data.view_count ?? 0,
      title: data.title ?? data.description?.slice(0, 100),
    };
  } catch (err) {
    // yt-dlp not installed or URL not supported
    console.warn(`yt-dlp failed for ${url}:`, (err as Error).message?.slice(0, 100));
    return null;
  }
}

/**
 * Batch scrape all videos. Returns stats.
 */
export async function scrapeAllCutterVideos(
  videos: Array<{ id: string; platform: string; external_id: string; url: string }>
): Promise<{ updated: number; failed: number; results: Array<{ id: string; views: number | null; title?: string }> }> {
  let updated = 0;
  let failed = 0;
  const results: Array<{ id: string; views: number | null; title?: string }> = [];

  for (const video of videos) {
    const result = await scrapeVideoViews(video.platform, video.external_id, video.url);
    if (result) {
      results.push({ id: video.id, views: result.views, title: result.title });
      updated++;
    } else {
      results.push({ id: video.id, views: null });
      failed++;
    }

    // Small delay between requests to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  return { updated, failed, results };
}
```

## src/lib/db.ts

```ts
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'dashboard.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initializeSchema(_db);
    seedSettings(_db);
  }
  return _db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cutters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      company_name TEXT,
      company_address TEXT,
      tax_id TEXT,
      iban TEXT,
      rate_per_view REAL NOT NULL DEFAULT 0.01,
      is_admin INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      magic_token TEXT,
      token_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cutter_sessions (
      id TEXT PRIMARY KEY,
      cutter_id TEXT NOT NULL REFERENCES cutters(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cutter_accounts (
      id TEXT PRIMARY KEY,
      cutter_id TEXT NOT NULL REFERENCES cutters(id) ON DELETE CASCADE,
      platform TEXT NOT NULL CHECK(platform IN ('tiktok','youtube','instagram','facebook')),
      account_handle TEXT NOT NULL,
      account_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(cutter_id, platform)
    );

    CREATE TABLE IF NOT EXISTS cutter_videos (
      id TEXT PRIMARY KEY,
      cutter_id TEXT NOT NULL REFERENCES cutters(id) ON DELETE CASCADE,
      platform TEXT NOT NULL CHECK(platform IN ('tiktok','youtube','instagram','facebook')),
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      account_handle TEXT,
      current_views INTEGER DEFAULT 0,
      views_at_last_invoice INTEGER DEFAULT 0,
      first_scraped_at TEXT,
      last_scraped_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(platform, external_id)
    );

    CREATE TABLE IF NOT EXISTS cutter_invoices (
      id TEXT PRIMARY KEY,
      cutter_id TEXT NOT NULL REFERENCES cutters(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL UNIQUE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      total_views INTEGER NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      rate_per_view REAL NOT NULL,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid')),
      recipient_company TEXT,
      sender_company TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cutter_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES cutter_invoices(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES cutter_videos(id),
      video_title TEXT,
      video_url TEXT,
      platform TEXT NOT NULL,
      views_in_period INTEGER NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cutter_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cutter_sessions_token ON cutter_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_cutter_videos_cutter ON cutter_videos(cutter_id);
    CREATE INDEX IF NOT EXISTS idx_cutter_videos_platform_ext ON cutter_videos(platform, external_id);
    CREATE INDEX IF NOT EXISTS idx_cutter_invoices_cutter ON cutter_invoices(cutter_id);
    CREATE INDEX IF NOT EXISTS idx_cutter_invoice_items_invoice ON cutter_invoice_items(invoice_id);
  `);
}

function seedSettings(db: Database.Database) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO cutter_settings (key, value) VALUES (?, ?)`
  );
  insert.run('recipient_company_name', 'Fabian Tausch');
  insert.run('recipient_company_address', 'Am Kellerberg 28, 90766 Fürth, Germany');
  insert.run('recipient_tax_id', 'DE305676414');
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
```

## src/lib/utils.ts

```ts
import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
```

