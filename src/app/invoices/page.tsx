"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { Receipt, Plus, FileText, FlaskConical } from "lucide-react";

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

function formatNum(n: number): string { return new Intl.NumberFormat("de-DE").format(n); }
function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("de-DE"); }

const STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  draft: { label: "Entwurf",  dot: "bg-yellow-400",  text: "text-yellow-400" },
  sent:  { label: "Gesendet", dot: "bg-blue-400",    text: "text-blue-400"   },
  paid:  { label: "Bezahlt",  dot: "bg-emerald-400", text: "text-emerald-400"},
};

export default function CutterInvoicesPage() {
  const router = useRouter();
  const [invoices,        setInvoices]        = useState<Invoice[]>([]);
  const [generating,      setGenerating]      = useState(false);
  const [generatingTest,  setGeneratingTest]  = useState(false);
  const [loading,         setLoading]         = useState(true);

  function loadInvoices() {
    fetch("/api/invoices")
      .then((r) => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then((data) => { if (data?.invoices) setInvoices(data.invoices); setLoading(false); });
  }

  useEffect(() => { loadInvoices(); }, [router]);

  async function handleGenerate() {
    if (!confirm("Rechnung generieren? Alle aktuellen Views werden als abgerechnet markiert.")) return;
    setGenerating(true);
    const res  = await fetch("/api/invoices/generate", { method: "POST" });
    const data = await res.json();
    setGenerating(false);
    if (res.ok) { loadInvoices(); router.push(`/invoices/${data.invoice.id}`); }
    else alert(data.error || "Fehler bei der Rechnungserstellung");
  }

  async function handleTestGenerate() {
    if (!confirm("Test-Rechnung generieren? Nutzt fiktive Views (10.000 pro Video) — echte Daten werden NICHT verändert.")) return;
    setGeneratingTest(true);
    const res  = await fetch("/api/invoices/generate?test=1", { method: "POST" });
    const data = await res.json();
    setGeneratingTest(false);
    if (res.ok) { loadInvoices(); router.push(`/invoices/${data.invoice.id}`); }
    else alert(data.error || "Fehler bei der Test-Rechnungserstellung");
  }

  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total_amount, 0);
  const totalOpen = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.total_amount, 0);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">

        {/* ── Page header ──────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Rechnungen</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoices.length > 0 ? `${invoices.length} Rechnungen · ${formatEur(totalPaid)} bezahlt` : "Noch keine Rechnungen erstellt"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleTestGenerate}
              disabled={generatingTest || generating}
              title="Generiert eine Testrechnung mit fiktiven Views — echte Daten bleiben unverändert"
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              <span className="hidden sm:block">{generatingTest ? "Wird erstellt…" : "Test"}</span>
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || generatingTest}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              {generating ? "Wird erstellt…" : "Rechnung generieren"}
            </button>
          </div>
        </div>

        {/* ── Summary strip — only when invoices exist ─────────── */}
        {!loading && invoices.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Rechnungen gesamt</p>
              <p className="text-xl font-bold tabular-nums">{invoices.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Bezahlt</p>
              <p className="text-xl font-bold tabular-nums text-emerald-400">{formatEur(totalPaid)}</p>
            </div>
            <div className={`rounded-lg border p-4 ${totalOpen > 0 ? "border-primary/20 bg-primary/[0.04]" : "border-border bg-card"}`}>
              <p className="text-xs text-muted-foreground mb-2">Offen</p>
              <p className={`text-xl font-bold tabular-nums ${totalOpen > 0 ? "text-primary" : ""}`}>{formatEur(totalOpen)}</p>
            </div>
          </div>
        )}

        {/* ── Invoice table ─────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-3.5 w-36 ml-2" />
                  <div className="flex-1" />
                  <div className="skeleton h-4 w-20" />
                </div>
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center py-20 px-6 text-center gap-2">
              <Receipt className="h-9 w-9 text-muted-foreground/15 mb-1" />
              <p className="text-sm font-medium">Noch keine Rechnungen</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Sobald du Views gesammelt hast, kannst du hier eine Rechnung generieren.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="mt-3 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
                Erste Rechnung generieren
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Rechnung</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Zeitraum</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Views</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Betrag</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Erstellt</th>
                    <th className="px-5 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => {
                    const s = STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft;
                    return (
                      <tr key={inv.id} className="hover:bg-accent/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="font-medium hover:text-primary transition-colors"
                            >
                              {inv.invoice_number}
                            </Link>
                            {inv.invoice_number.startsWith("TEST-") && (
                              <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                TEST
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">
                          {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">{formatNum(inv.total_views)}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums font-semibold">{formatEur(inv.total_amount)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                            <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground">{formatDate(inv.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors"
                            title="PDF öffnen"
                          >
                            <FileText className="h-3.5 w-3.5" />
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
