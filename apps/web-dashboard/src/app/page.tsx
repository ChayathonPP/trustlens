"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Verdict = "likely_ai" | "likely_human" | "inconclusive";

type TrustSignals = {
  provenance?: {
    has_c2pa?: boolean;
    claims?: unknown;
    reasons?: string[];
  };
  image?: {
    p_ai?: number; // 0..1
    reasons?: string[];
  };
};

type TrustResponse = {
  trust: {
    trust_score: number; // 0..100
    verdict: Verdict | string;
    explanations: string[];
  };
  signals: TrustSignals;
};

type AnalyzePayload =
  | { type: "image"; content_url: string }
  | { type: "video"; content_url: string }
  | { type: "audio"; content_url: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function verdictBadgeColor(verdict: string): string {
  switch (verdict) {
    case "likely_ai":
      return "bg-red-500";
    case "likely_human":
      return "bg-emerald-500";
    default:
      return "bg-amber-500";
  }
}

export default function Page() {
  const [url, setUrl] = useState<string>("https://picsum.photos/400");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrustResponse | null>(null);

  const controllerRef = useRef<AbortController | null>(null);

  const payload: AnalyzePayload = useMemo(
    () => ({ type: "image", content_url: url }),
    [url]
  );

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);

    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;

    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
      }

      const json: TrustResponse = await res.json();
      setResult(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [payload]);

  useEffect(() => {
    // run once on mount for the default URL
    void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = result?.trust;
  const signals = result?.signals;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">TrustLens Dashboard</h1>
          <span className="text-xs text-gray-400">
            API: {API_URL.replace(/^https?:\/\//, "")}
          </span>
        </header>

        <section className="rounded-xl border border-gray-800 p-4 space-y-4">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Image/Video URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              onClick={() => void analyze()}
              disabled={loading || !url}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {badge && (
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${verdictBadgeColor(
                  String(badge.verdict)
                )}`}
              >
                {String(badge.verdict).replace("_", " ")}
              </span>
              <span className="text-sm text-gray-400">
                Trust score: <b>{badge.trust_score}</b>
              </span>
            </div>
          )}
        </section>

        {signals && (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-800 p-4">
              <h3 className="mb-2 text-sm font-medium text-gray-300">
                Image Signals
              </h3>
              <ul className="list-disc pl-5 text-sm text-gray-400 space-y-1">
                {"image" in signals && signals.image?.p_ai !== undefined && (
                  <li>P(AI): {signals.image.p_ai.toFixed(2)}</li>
                )}
                {signals.image?.reasons?.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border border-gray-800 p-4">
              <h3 className="mb-2 text-sm font-medium text-gray-300">
                Provenance
              </h3>
              <ul className="list-disc pl-5 text-sm text-gray-400 space-y-1">
                {signals.provenance?.has_c2pa !== undefined && (
                  <li>C2PA: {signals.provenance.has_c2pa ? "yes" : "no"}</li>
                )}
                {signals.provenance?.reasons?.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
