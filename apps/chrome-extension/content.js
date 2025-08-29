// -----------------------------
// TrustLens content script (full)
// -----------------------------

// API endpoint (fallback to 127.0.0.1 if localhost fails once)
let API_URL = "http://localhost:8000/analyze";

// Sampling cadence (exponential backoff up to SAMPLE_MS_MAX)
const SAMPLE_MS_BASE = 2000;
const SAMPLE_MS_MAX = 10000;

// Fetch timeout (longer to avoid false offline on slower machines)
const FETCH_TIMEOUT = 4000;

// State
let state = {
  failCount: 0,
  lastVerdict: null,
  lastScore: null,
  badgeEl: null,
  attachedTo: null,
};

// Utility: wait for a condition with timeout
function waitFor(pred, timeoutMs = 10000, intervalMs = 100) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const it = setInterval(() => {
      try {
        if (pred()) {
          clearInterval(it);
          resolve(true);
        } else if (Date.now() - t0 > timeoutMs) {
          clearInterval(it);
          reject(new Error("waitFor timeout"));
        }
      } catch (e) {
        clearInterval(it);
        reject(e);
      }
    }, intervalMs);
  });
}

// Find a visible <video> element
function findVideo() {
  const vids = Array.from(document.querySelectorAll("video"));
  for (const v of vids) {
    const rect = v.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 100 && rect.bottom > 0 && rect.right > 0) {
      return v;
    }
  }
  return null;
}

// Attach badge to video’s nearest positioned parent (or body as fallback)
function ensureBadge(videoEl) {
  if (state.badgeEl && state.attachedTo === videoEl) return state.badgeEl;

  // Create badge element
  const badge = document.createElement("div");
  badge.id = "trustlens-badge";
  badge.className = "trustlens-unc";

  const icon = document.createElement("div");
  icon.className = "trustlens-icon";
  icon.style.backgroundImage = `url(${chrome.runtime.getURL("icons/uncertain-amber.png")})`;

  const text = document.createElement("div");
  text.className = "trustlens-text";

  const title = document.createElement("span");
  title.className = "trustlens-title";
  title.textContent = "TrustLens:";

  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = "Uncertain";

  const score = document.createElement("span");
  score.className = "trustlens-score";
  score.textContent = "score —";

  text.appendChild(title);
  text.appendChild(pill);
  text.appendChild(score);

  badge.appendChild(icon);
  badge.appendChild(text);

  // Choose container
  let container = videoEl.closest("div");
  if (!container) container = document.body;

  // Ensure container can position absolute children (for non-body)
  const cs = container === document.body ? null : getComputedStyle(container);
  if (container !== document.body && cs && cs.position === "static") {
    container.style.position = "relative";
  }
  container.appendChild(badge);

  state.badgeEl = badge;
  state.attachedTo = videoEl;
  return badge;
}

// Update badge visuals
function applyStatus(verdict, score01, opts = {}) {
  const { offline = false } = opts;
  const b = state.badgeEl;
  if (!b) return;

  const icon = b.querySelector(".trustlens-icon");
  const pill = b.querySelector(".pill");
  const scoreEl = b.querySelector(".trustlens-score");

  // Reset classes
  b.classList.remove("trustlens-human", "trustlens-ai", "trustlens-unc", "trustlens-offline");

  if (offline) {
    b.classList.add("trustlens-offline");
    icon.style.backgroundImage = `url(${chrome.runtime.getURL("icons/icon16.png")})`;
    pill.textContent = "Offline";
    scoreEl.textContent = "—";
    return;
  }

  // Normalize verdict text + choose icon/color
  let cls = "trustlens-unc";
  let iconFile = "uncertain-amber.png";
  let label = "Uncertain";

  const v = String(verdict || "").toLowerCase();
  if (v.includes("human")) {
    cls = "trustlens-human";
    iconFile = "human-green.png";
    label = "Likely Human";
  } else if (v.includes("ai")) {
    cls = "trustlens-ai";
    iconFile = "ai-red.png";
    label = "Likely AI";
  }

  b.classList.add(cls);
  icon.style.backgroundImage = `url(${chrome.runtime.getURL("icons/" + iconFile)})`;
  pill.textContent = label;

  const s = (typeof score01 === "number" && !Number.isNaN(score01)) ? score01 : null;
  scoreEl.textContent = s === null ? "score —" : `score ${s.toFixed(2)}`;
}

// Grabs a JPEG data URL from the current video frame
function sampleFrame(videoEl) {
  if (!videoEl || videoEl.readyState < 2) return null; // not enough data
  const w = Math.max(160, Math.floor(videoEl.videoWidth / 3) || 160);
  const h = Math.max(160, Math.floor(videoEl.videoHeight / 3) || 160);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  try {
    ctx.drawImage(videoEl, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}

// Calls the local API with timeout + fallback to 127.0.0.1
async function analyzeImage(dataUrl) {
  const b64 = dataUrl.split(",")[1];

  const callApi = async (url) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
        mode: "cors",
        cache: "no-store",
        body: JSON.stringify({ type: "image", content_b64: b64 })
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };

  try {
    const json = await callApi(API_URL);
    const verdict = json?.trust?.verdict || "Uncertain";
    const rawScore = Number(json?.trust?.trust_score ?? 50);
    const score01 = rawScore > 1 ? rawScore / 100 : rawScore;
    return { verdict, score: Math.max(0, Math.min(1, score01)) };
  } catch (err) {
    const msg = String(err?.message || err);
    const isAbort = err?.name === "AbortError";
    const looksNetwork = isAbort || /Failed to fetch|NetworkError|net::ERR/i.test(msg);

    if (API_URL.includes("localhost") && looksNetwork) {
      const fallback = "http://127.0.0.1:8000/analyze";
      console.warn("[TrustLens] localhost failed, retrying via 127.0.0.1 …", msg);
      try {
        const json = await callApi(fallback);
        API_URL = fallback; // stick to 127.0.0.1
        const verdict = json?.trust?.verdict || "Uncertain";
        const rawScore = Number(json?.trust?.trust_score ?? 50);
        const score01 = rawScore > 1 ? rawScore / 100 : rawScore;
        return { verdict, score: Math.max(0, Math.min(1, score01)) };
      } catch (err2) {
        console.warn("[TrustLens] fallback to 127.0.0.1 also failed:", err2?.message || err2);
        throw err2;
      }
    }
    throw err;
  }
}

// Main loop
async function tick() {
  try {
    const video = findVideo();
    if (!video) {
      if (state.badgeEl) state.badgeEl.classList.add("trustlens-hidden");
      state.failCount = Math.min(state.failCount + 1, 6);
      scheduleNext();
      return;
    }

    const badge = ensureBadge(video);
    badge.classList.remove("trustlens-hidden");

    const frame = sampleFrame(video);
    if (!frame) {
      applyStatus(null, null, { offline: true });
      state.failCount = Math.min(state.failCount + 1, 6);
      scheduleNext();
      return;
    }

    const { verdict, score } = await analyzeImage(frame);
    state.lastVerdict = verdict;
    state.lastScore = score;
    state.failCount = 0;

    applyStatus(verdict, score);
  } catch (err) {
    console.warn("[TrustLens] analyze failed:", err?.name || "", err?.message || err);
    applyStatus(null, null, { offline: true });
    state.failCount = Math.min(state.failCount + 1, 6);
  } finally {
    scheduleNext();
  }
}

// Exponential backoff between 2s .. 10s
function scheduleNext() {
  const delay = Math.min(
    SAMPLE_MS_BASE * Math.pow(2, Math.max(0, state.failCount - 1)),
    SAMPLE_MS_MAX
  );
  setTimeout(tick, delay);
}

// Bootstrap: wait for DOM ready then start the loop
(function boot() {
  const start = () => setTimeout(tick, 800);
  if (document.readyState === "complete" || document.readyState === "interactive") {
    start();
  } else {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  }
  console.log("TrustLens content script loaded");
})();
