"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { Link2, Trash2, Plus } from "lucide-react";

interface Account {
  id: string;
  platform: string;
  account_handle: string;
  account_url: string | null;
  created_at: string;
  oauth_access_token?: string | null;
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

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
        type === "success"
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      {message}
    </div>
  );
}

function AccountsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Show toast based on query params
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "instagram_connected") {
      setToast({ message: "Instagram erfolgreich verbunden!", type: "success" });
      // Remove query param without reload
      router.replace("/accounts");
    } else if (error === "instagram_denied") {
      setToast({ message: "Instagram-Verbindung abgelehnt.", type: "error" });
      router.replace("/accounts");
    } else if (error === "invalid_state") {
      setToast({ message: "Sicherheitsfehler: Ungültiger State. Bitte erneut versuchen.", type: "error" });
      router.replace("/accounts");
    } else if (error === "instagram_failed") {
      setToast({ message: "Instagram-Verbindung fehlgeschlagen. Bitte erneut versuchen.", type: "error" });
      router.replace("/accounts");
    }
  }, [searchParams, router]);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  return (
    <>
      <CutterNav />
      {toast && <Toast message={toast.message} type={toast.type} />}
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
            const isInstagram = p.id === "instagram";

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

                {isInstagram ? (
                  linked ? (
                    // Instagram is linked — show handle + OAuth badge
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          @{linked.account_handle}
                        </span>
                      </div>
                      {linked.oauth_access_token ? (
                        <span className="inline-flex w-fit items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-500/30">
                          OAuth verbunden
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex w-fit items-center rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/30">
                            Manuell
                          </span>
                          <button
                            onClick={() => { window.location.href = "/api/auth/instagram"; }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                            Mit Instagram verbinden
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Instagram not linked — show OAuth button only (no handle input)
                    <button
                      onClick={() => { window.location.href = "/api/auth/instagram"; }}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground w-full justify-center"
                    >
                      <Plus className="h-4 w-4" />
                      Mit Instagram verbinden
                    </button>
                  )
                ) : linked ? (
                  // Non-Instagram linked
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      @{linked.account_handle}
                    </span>
                  </div>
                ) : isLinking ? (
                  // Non-Instagram handle input form
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

export default function CutterAccountsPage() {
  return (
    <Suspense>
      <AccountsPageInner />
    </Suspense>
  );
}
