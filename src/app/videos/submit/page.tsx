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
