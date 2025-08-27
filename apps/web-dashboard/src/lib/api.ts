export type AnalyzeType = "image" | "video";

export async function analyzeContent(type: AnalyzeType, url: string) {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const r = await fetch(`${api}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, content_url: url }),
  });
  // Let caller handle non-2xx
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: true, status: r.status, body: text };
  }
}
