"use client";

import { useState } from "react";
import { analyzeContent } from "@/lib/api";

export default function Home() {
  const [url, setUrl] = useState("https://picsum.photos/400");
  const [type, setType] = useState<"image" | "video">("image");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeContent(type, url);
      if ((data as any)?.error) {
        setError(`API error ${data.status}`);
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-8 gap-6">
      <h1 className="text-3xl font-bold">TrustLens Dashboard</h1>

      <div className="w-full max-w-2xl grid gap-3">
        <label className="text-sm font-medium">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as any)}
          className="border rounded p-2"
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>

        <label className="text-sm font-medium mt-4">Content URL</label>
        <input
          className="border rounded p-2"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <button
          onClick={onAnalyze}
          disabled={loading || !url}
          className="mt-4 rounded px-4 py-2 bg-blue-600 text-white disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {error && (
        <div className="text-red-600">
          {error}
        </div>
      )}

      {result && (
        <pre className="w-full max-w-3xl bg-gray-100 p-4 rounded text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
