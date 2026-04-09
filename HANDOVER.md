# Cutter Dashboard — Übergabedokument

_Stand: 07.04.2026_

---

## 1. Was ist das Projekt?

Eine interne Next.js-Webanwendung zur Verwaltung von Video-Cuttern.
Cutter reichen Video-Links ein, Views werden täglich gescrapt, auf Basis der View-Deltas werden Rechnungen generiert.

---

## 2. Tech Stack

| Komponente | Technologie |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS v4, Dark Theme |
| Datenbank | Turso (libSQL) — lokal `data/dashboard.db`, Produktion via Turso Cloud |
| E-Mail | Resend (Magic Link) |
| Icons | Lucide React |
| Deployment | Vercel (`cutter-dashboard.vercel.app`) |

---

## 3. Implementierte Features

### Authentifizierung
- Magic Link per E-Mail (kein Passwort)
- Tokens laufen nach 15 Minuten ab
- Sessions gelten 30 Tage, HttpOnly Cookie

### Video-Einreichung (`/videos/submit`)
- URL-Parsing für YouTube, TikTok, Instagram, Facebook
- Kontoabgleich: Video muss dem verknüpften Konto des Cutters gehören
- Duplikat-Erkennung (plattformweit, nicht nur pro Cutter)
- Sofortiger Scrape beim Einreichen

### View-Scraping (`/api/scrape`)
- YouTube: offizielles Data API v3
- TikTok: oEmbed + HTML-Parsing (fragil, plattformabhängig)
- Instagram: oEmbed + HTML-Parsing (fragil, plattformabhängig)
- Facebook: oEmbed (benötigt App-Token) + HTML-Parsing (fragil)
- Retry-Logik bei Netzwerkfehlern
- View-Snapshots werden 365 Tage gespeichert
- Cron-Endpoint geschützt via `CUTTER_CRON_KEY`

### Rechnungsstellung (`/invoices`)
- Delta-Abrechnung: nur neue Views seit letzter Rechnung
- Rechnungsnummer: `RE-YYYY-NNN` (sequenziell)
- Nach Generierung: `views_at_last_invoice` wird zurückgesetzt
- Rechnungsvorlage: HTML im DIN 5008-Stil, Print-to-PDF im Browser
- Status: `draft` / `sent` / `paid` (in DB vorhanden)

### Admin-Bereich (`/admin`)
- Neue Cutter anlegen (Name, E-Mail, Rate pro View)
- Cutter aktivieren/deaktivieren
- Admin-Rechte vergeben
- Empfänger-Firmendaten für alle Rechnungen konfigurieren

### Weitere Seiten
- `/dashboard` — KPI-Kacheln + letzte Videos
- `/videos` — Videoliste mit unbilled Views
- `/accounts` — Plattformkonten verknüpfen (1 pro Plattform)
- `/profile` — Rechnungsdaten des Cutters (Firma, IBAN, Steuernr.)

---

## 4. Datenbankstruktur

Datenbank-Datei: `data/dashboard.db` (lokal, in `.gitignore`)

| Tabelle | Inhalt |
|---|---|
| `cutters` | Alle Cutter inkl. Billing-Daten, Rate, Admin-Flag |
| `cutter_sessions` | Aktive Login-Sessions |
| `cutter_accounts` | Verknüpfte Plattformkonten |
| `cutter_videos` | Eingereichte Videos mit View-Stand |
| `cutter_invoices` | Generierte Rechnungen |
| `cutter_invoice_items` | Einzelpositionen pro Rechnung |
| `cutter_settings` | Key-Value-Einstellungen (Empfänger-Firma) |
| `cutter_view_snapshots` | Tägliche View-History (365 Tage) |

Schema wird beim ersten Start automatisch angelegt (`ensureDb()`).

Voreingestellt in `cutter_settings`:
- `recipient_company_name`: Fabian Tausch
- `recipient_company_address`: Am Kellerberg 28, 90766 Fürth, Germany
- `recipient_tax_id`: DE305676414

---

## 5. Umgebungsvariablen (noch einzurichten)

Es existiert **keine** `.env.local`-Datei im Repo. Diese muss vor dem ersten Start angelegt werden.

```
# E-Mail (Magic Link)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Cutter Dashboard <noreply@yourdomain.com>

# App-URL (für Magic Links in E-Mails)
CUTTER_BASE_URL=https://your-production-url.com

# YouTube Data API v3
YOUTUBE_API_KEY=...

# Facebook (optional, verbessert View-Scraping erheblich)
FACEBOOK_APP_TOKEN=...

# Turso (nur Produktion)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...

# Cron-Schutz (beliebiger geheimer String)
CUTTER_CRON_KEY=ein-geheimer-schluessel
```

**Lokal** (ohne Turso) reicht:
```
RESEND_API_KEY=re_...
YOUTUBE_API_KEY=...
CUTTER_CRON_KEY=local-secret
```
Die DB wird dann als lokale Datei `data/dashboard.db` angelegt.

---

## 6. Admin-User anlegen (einmalig)

Der Admin-User existiert **nicht** automatisch in der Datenbank. Er muss manuell eingetragen werden. Entweder via SQLite CLI oder einem einmaligen Skript:

```sql
INSERT INTO cutters (id, name, email, rate_per_view, is_admin, is_active)
VALUES (
  lower(hex(randomblob(16))),
  'Fabian Tausch',
  'fabian@unicornbakery.de',
  0.01,
  1,
  1
);
```

Danach ist Login via Magic Link möglich.

---

## 7. Lokales Setup

```bash
npm install
# .env.local anlegen (siehe Abschnitt 5)
npm run dev
# → http://localhost:3000
```

---

## 8. Deployment (eingerichtet)

**Vercel** — bereits deployed und live.

- URL: `cutter-dashboard.vercel.app`
- Projekt-ID: `prj_tY6sHF45DhD1Khhszu8DKeRN3UZQ`
- Team: `team_V2fCmj64UjNE3dSpCUIot4Th`
- Letztes Deployment: READY (Production)
- 12 Deployments bisher, alle via `actor: claude`
- Keine Custom Domain konfiguriert
- Node.js 24.x

**Neues Deployment auslösen:**
```bash
vercel --prod
```

**Noch offen bei Deployment:**
- Optional: Custom Domain einrichten
- Cron-Job konfigurieren (siehe Abschnitt 9)

---

## 9. Cron-Job für Scraping (noch ausstehend)

Der Scrape-Endpoint ist fertig: `POST /api/scrape`
Authentifizierung: Header `x-cron-key: <CUTTER_CRON_KEY>`

**Option A — Vercel Cron** (`vercel.json`):
```json
{
  "crons": [{
    "path": "/api/scrape",
    "schedule": "0 4 * * *"
  }]
}
```
Plus in `.env`: `CRON_SECRET=<gleicher Wert wie CUTTER_CRON_KEY>`

**Option B — GitHub Actions / externer Cron-Dienst:**
```bash
curl -X POST https://your-url.com/api/scrape \
  -H "x-cron-key: <CUTTER_CRON_KEY>"
```

---

## 10. Offene Punkte / bekannte Lücken

| # | Thema | Priorität | Beschreibung |
|---|---|---|---|
| 1 | **Cron-Job** | Hoch | Tägliches Scraping muss extern getriggert werden (Vercel Cron o.ä.). Endpoint ist fertig. |
| 2 | **YouTube API Key** | Mittel | In `src/lib/cutter/scraper.ts:1` ist ein Fallback-API-Key hardcoded. Muss aus Code entfernt, nur noch via Env-Variable gesetzt werden. |
| 3 | **Rechnungsstatus-UI** | Mittel | DB-Feld `status` (draft/sent/paid) existiert, aber kein UI zum Wechseln des Status. |
| 4 | **Custom Domain** | Mittel | Aktuell nur `cutter-dashboard.vercel.app` — ggf. eigene Domain einrichten. |
| 5 | **Scrape-Monitoring UI** | Niedrig | API `GET /api/admin/scrape-status` ist fertig, aber kein Admin-Panel-Tab dafür. |
| 6 | **Instagram/TikTok Scraping** | Niedrig | Basiert auf HTML-Parsing — kann bei Plattform-Updates kaputtgehen. Als Risiko einplanen. |
| 7 | **Facebook ohne App-Token** | Niedrig | Ohne `FACEBOOK_APP_TOKEN` ist Facebook-Scraping sehr unzuverlässig. |
| 8 | **Doppelte Dateien** | Kosmetik | `package-lock 2.json` und `next-env.d 2.ts` im Root können gelöscht werden. |

---

## 11. API-Übersicht

```
POST /api/auth/send-magic-link   → Magic Link anfordern
GET  /api/auth/verify?token=xxx  → Token einlösen, Session setzen
GET  /api/auth/session           → Aktuelle Session prüfen
POST /api/auth/logout            → Session löschen

GET  /api/stats                  → KPI-Daten (Dashboard)
GET  /api/videos                 → Eigene Videos
POST /api/videos                 → Videos einreichen (Array von URLs)
DELETE /api/videos/[id]          → Video löschen

GET  /api/accounts               → Verknüpfte Konten
POST /api/accounts               → Konto verknüpfen
DELETE /api/accounts/[id]        → Konto entfernen

GET  /api/profile                → Billing-Daten abrufen
PATCH /api/profile               → Billing-Daten aktualisieren

GET  /api/invoices               → Rechnungsliste
POST /api/invoices/generate      → Rechnung generieren
GET  /api/invoices/[id]          → Rechnungsdetail
GET  /api/invoices/[id]/pdf      → Rechnung als HTML (Print-to-PDF)

POST /api/scrape                 → Alle Videos scrapen (Cron)

GET  /api/admin/cutters          → Cutter-Liste (Admin)
POST /api/admin/cutters          → Neuen Cutter anlegen (Admin)
PATCH /api/admin/cutters         → Cutter aktualisieren (Admin)
GET  /api/admin/settings         → Einstellungen abrufen (Admin)
PUT  /api/admin/settings         → Einstellung setzen (Admin)
GET  /api/admin/scrape-status    → Scraping-Monitoring (Admin)
```

---

## 12. Wichtige Dateipfade

```
src/lib/db.ts                          → Datenbank-Client + Schema
src/lib/cutter/auth.ts                 → Magic Link, Session-Management
src/lib/cutter/middleware.ts           → Auth-Guard für API-Routes
src/lib/cutter/scraper.ts              → View-Scraping (alle Plattformen)
src/lib/cutter/invoice-template.ts    → DIN 5008 HTML-Rechnungsvorlage
src/lib/cutter/helpers.ts             → URL-Parsing, Rechnungsnummer
src/lib/cutter/email.ts               → Resend-Integration
src/app/api/scrape/route.ts           → Cron-Endpoint
src/app/api/invoices/generate/route.ts → Rechnungsgenerierung
src/app/admin/page.tsx                → Admin-Panel UI
```
