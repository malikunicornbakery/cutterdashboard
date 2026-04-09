"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw,
  Bell,
  AlertTriangle,
  Clock,
  ImageIcon,
  HelpCircle,
  ChevronDown,
  Flag,
  ExternalLink,
} from "lucide-react";

interface DiscrepancyAlert {
  id: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  claimed_views: number | null;
  current_views: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  created_at: string | null;
  cutter_name: string | null;
}

interface NotSyncedAlert {
  id: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  current_views: number | null;
  last_scraped_at: string | null;
  cutter_name: string | null;
}

interface PendingProofAlert {
  id: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  claimed_views: number | null;
  current_views: number | null;
  proof_status: string | null;
  proof_uploaded_at: string | null;
  cutter_name: string | null;
}

interface UnverifiedAlert {
  id: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  claimed_views: number | null;
  cutter_name: string | null;
  created_at: string | null;
}

interface AlertCounts {
  discrepancies: number;
  notSynced: number;
  pendingProof: number;
  unverified: number;
  total: number;
}

interface AlertsResponse {
  discrepancies: DiscrepancyAlert[];
  notSynced: NotSyncedAlert[];
  pendingProof: PendingProofAlert[];
  unverified: UnverifiedAlert[];
  counts: AlertCounts;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Nie";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

function isUrgent(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff > 48 * 60 * 60 * 1000;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  countCls,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  countCls: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 whitespace-nowrap ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      {icon}
      <span className="hidden sm:block">{label}</span>
      {count > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${countCls}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors"
    >
      <span className="font-semibold text-sm">{title}</span>
      <ChevronDown
        className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

type Tab = "discrepancies" | "notSynced" | "pendingProof" | "unverified";

export default function AlertQueuePage() {
  const router = useRouter();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("discrepancies");
  const [openSections, setOpenSections] = useState<Record<Tab, boolean>>({
    discrepancies: true,
    notSynced: true,
    pendingProof: true,
    unverified: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/ops/alerts");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  function toggleSection(tab: Tab) {
    setOpenSections(prev => ({ ...prev, [tab]: !prev[tab] }));
  }

  const counts = data?.counts ?? { discrepancies: 0, notSynced: 0, pendingProof: 0, unverified: 0, total: 0 };

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Alert Queue</h1>
            {data && counts.total > 0 && (
              <span className="flex h-6 items-center rounded-full bg-red-500/15 px-2.5 text-xs font-bold text-red-400">
                {counts.total}
              </span>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-border pb-2">
          <TabButton
            active={activeTab === "discrepancies"}
            onClick={() => setActiveTab("discrepancies")}
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Abweichungen"
            count={counts.discrepancies}
            countCls="bg-red-500/15 text-red-400"
          />
          <TabButton
            active={activeTab === "notSynced"}
            onClick={() => setActiveTab("notSynced")}
            icon={<Clock className="h-4 w-4" />}
            label="Kein Sync"
            count={counts.notSynced}
            countCls="bg-yellow-500/15 text-yellow-400"
          />
          <TabButton
            active={activeTab === "pendingProof"}
            onClick={() => setActiveTab("pendingProof")}
            icon={<ImageIcon className="h-4 w-4" />}
            label="Beleg ausstehend"
            count={counts.pendingProof}
            countCls="bg-blue-500/15 text-blue-400"
          />
          <TabButton
            active={activeTab === "unverified"}
            onClick={() => setActiveTab("unverified")}
            icon={<HelpCircle className="h-4 w-4" />}
            label="Nicht verifiziert"
            count={counts.unverified}
            countCls="bg-orange-500/15 text-orange-400"
          />
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            <RefreshCw className="h-6 w-6 mx-auto mb-3 animate-spin opacity-50" />
            <p className="text-sm">Lade Alerts…</p>
          </div>
        ) : !data ? null : (
          <>
            {/* Discrepancies */}
            {activeTab === "discrepancies" && (
              <div className="rounded-xl border border-red-500/20 bg-card overflow-hidden">
                <SectionHeader
                  title={`Abweichungen (${counts.discrepancies})`}
                  open={openSections.discrepancies}
                  onToggle={() => toggleSection("discrepancies")}
                />
                {openSections.discrepancies && (
                  data.discrepancies.length === 0 ? (
                    <div className="px-5 py-10 text-center text-muted-foreground text-sm">
                      <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      Keine Abweichungen gefunden
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Cutter</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Plattform</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground max-w-48">Clip</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Angabe</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Verifiziert</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Disc.%</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.discrepancies.map((item) => {
                            const isCritical = item.discrepancy_status === "critical_difference";
                            return (
                              <tr
                                key={item.id}
                                className={`hover:bg-muted/30 ${isCritical ? "border-l-2 border-red-500" : "border-l-2 border-amber-500"}`}
                              >
                                <td className="px-4 py-3 text-xs font-medium">{item.cutter_name ?? "—"}</td>
                                <td className="px-4 py-3">
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                    {PLATFORM_LABELS[item.platform ?? ""] ?? item.platform ?? "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 max-w-48">
                                  {item.url ? (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-xs hover:text-primary truncate"
                                      title={item.title ?? ""}
                                    >
                                      <span className="truncate">{item.title ?? item.url}</span>
                                      <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                    </a>
                                  ) : (
                                    <span className="text-xs text-muted-foreground truncate">{item.title ?? "—"}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-xs font-mono">{formatNum(item.claimed_views)}</td>
                                <td className="px-4 py-3 text-right text-xs font-mono">{formatNum(item.current_views)}</td>
                                <td className="px-4 py-3 text-right text-xs">
                                  {item.discrepancy_percent != null ? (
                                    <span className={isCritical ? "text-red-400 font-bold" : "text-orange-400 font-medium"}>
                                      {item.discrepancy_percent > 0 ? "+" : ""}{item.discrepancy_percent.toFixed(1)}%
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                    isCritical ? "bg-red-500/10 text-red-400" : "bg-orange-500/10 text-orange-400"
                                  }`}>
                                    {isCritical ? "Kritisch" : "Verdächtig"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Link
                                    href={`/ops/clips/${item.id}`}
                                    className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                                  >
                                    <Flag className="h-3 w-3" />
                                    Prüfen
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Not synced */}
            {activeTab === "notSynced" && (
              <div className="rounded-xl border border-yellow-500/20 bg-card overflow-hidden">
                <SectionHeader
                  title={`Kein Sync seit 7+ Tagen (${counts.notSynced})`}
                  open={openSections.notSynced}
                  onToggle={() => toggleSection("notSynced")}
                />
                {openSections.notSynced && (
                  data.notSynced.length === 0 ? (
                    <div className="px-5 py-10 text-center text-muted-foreground text-sm">
                      <Clock className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      Alle Clips wurden kürzlich synchronisiert
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Cutter</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Plattform</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground max-w-48">Clip</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Views</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Letzter Sync</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.notSynced.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 text-xs font-medium">{item.cutter_name ?? "—"}</td>
                              <td className="px-4 py-3">
                                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {PLATFORM_LABELS[item.platform ?? ""] ?? item.platform ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-48">
                                {item.url ? (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs hover:text-primary truncate"
                                    title={item.title ?? ""}
                                  >
                                    <span className="truncate">{item.title ?? item.url}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground truncate">{item.title ?? "—"}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-mono">{formatNum(item.current_views)}</td>
                              <td className="px-4 py-3 text-xs text-yellow-400">
                                {item.last_scraped_at ? formatRelative(item.last_scraped_at) : "Nie"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Link
                                  href={`/ops/clips/${item.id}`}
                                  className="rounded bg-muted px-2 py-1 text-xs hover:bg-accent transition-colors"
                                >
                                  Detail
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Pending proof */}
            {activeTab === "pendingProof" && (
              <div className="rounded-xl border border-blue-500/20 bg-card overflow-hidden">
                <SectionHeader
                  title={`Beleg ausstehend (${counts.pendingProof})`}
                  open={openSections.pendingProof}
                  onToggle={() => toggleSection("pendingProof")}
                />
                {openSections.pendingProof && (
                  data.pendingProof.length === 0 ? (
                    <div className="px-5 py-10 text-center text-muted-foreground text-sm">
                      <ImageIcon className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      Keine ausstehenden Belege
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Cutter</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Plattform</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground max-w-48">Clip</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Angabe</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Eingereicht</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Prüfen</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.pendingProof.map((item) => {
                            const urgent = isUrgent(item.proof_uploaded_at);
                            return (
                              <tr key={item.id} className={`hover:bg-muted/30 ${urgent ? "border-l-2 border-blue-500" : ""}`}>
                                <td className="px-4 py-3 text-xs font-medium">{item.cutter_name ?? "—"}</td>
                                <td className="px-4 py-3">
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                    {PLATFORM_LABELS[item.platform ?? ""] ?? item.platform ?? "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 max-w-48">
                                  {item.url ? (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-xs hover:text-primary truncate"
                                      title={item.title ?? ""}
                                    >
                                      <span className="truncate">{item.title ?? item.url}</span>
                                      <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                    </a>
                                  ) : (
                                    <span className="text-xs text-muted-foreground truncate">{item.title ?? "—"}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-xs font-mono">{formatNum(item.claimed_views)}</td>
                                <td className="px-4 py-3 text-xs">
                                  <span className={urgent ? "text-orange-400 font-medium" : "text-muted-foreground"}>
                                    {formatRelative(item.proof_uploaded_at)}
                                    {urgent && " ⚠"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Link
                                    href={`/ops/clips/${item.id}`}
                                    className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
                                  >
                                    <ImageIcon className="h-3 w-3" />
                                    Prüfen
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Unverified */}
            {activeTab === "unverified" && (
              <div className="rounded-xl border border-orange-500/20 bg-card overflow-hidden">
                <SectionHeader
                  title={`Nicht verifiziert seit 3+ Tagen (${counts.unverified})`}
                  open={openSections.unverified}
                  onToggle={() => toggleSection("unverified")}
                />
                {openSections.unverified && (
                  data.unverified.length === 0 ? (
                    <div className="px-5 py-10 text-center text-muted-foreground text-sm">
                      <HelpCircle className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      Keine unverifizierte Clips vorhanden
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Cutter</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Plattform</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground max-w-48">Clip</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Angabe</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Erstellt</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.unverified.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 text-xs font-medium">{item.cutter_name ?? "—"}</td>
                              <td className="px-4 py-3">
                                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {PLATFORM_LABELS[item.platform ?? ""] ?? item.platform ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-48">
                                {item.url ? (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs hover:text-primary truncate"
                                    title={item.title ?? ""}
                                  >
                                    <span className="truncate">{item.title ?? item.url}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground truncate">{item.title ?? "—"}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-mono">{formatNum(item.claimed_views)}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {formatRelative(item.created_at)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Link
                                  href={`/ops/clips/${item.id}`}
                                  className="rounded bg-muted px-2 py-1 text-xs hover:bg-accent transition-colors"
                                >
                                  Detail
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Empty state */}
            {counts.total === 0 && (
              <div className="rounded-xl border border-border bg-card px-5 py-16 text-center">
                <Bell className="h-10 w-10 mx-auto mb-4 text-emerald-400 opacity-60" />
                <p className="font-semibold text-emerald-400">Alles in Ordnung!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Keine offenen Alerts vorhanden.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
