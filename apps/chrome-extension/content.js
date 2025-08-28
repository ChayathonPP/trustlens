// content.js

(function () {
  // Create a host container and shadow root to isolate styles from the page
  const host = document.createElement('div');
  host.id = 'trustlens-host';
  host.style.position = 'fixed'; // in case we don’t find a player yet, we still won’t flicker
  host.style.zIndex = '2147483647'; // top-most
  host.style.pointerEvents = 'none';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inline styles for the badge (lives inside shadow DOM)
  const style = document.createElement('style');
  style.textContent = `
    .tl-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 10px;
      background: rgba(20, 20, 20, 0.75);
      color: #fff;
      font: 600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      pointer-events: none;
      user-select: none;
      transform: translateZ(0);
      white-space: nowrap;
    }
    .tl-badge img {
      width: 16px;
      height: 16px;
      display: block;
      filter: drop-shadow(0 1px 1px rgba(0,0,0,.4));
    }
    .tl-sub {
      opacity: .8;
      font-weight: 500;
      margin-left: 4px;
    }
  `;
  shadow.appendChild(style);

  // Badge DOM
  const badge = document.createElement('div');
  badge.className = 'tl-badge';
  const icon = document.createElement('img');
  const text = document.createElement('span');
  const sub = document.createElement('span');
  sub.className = 'tl-sub';

  badge.appendChild(icon);
  badge.appendChild(text);
  badge.appendChild(sub);
  shadow.appendChild(badge);

  // Map verdict -> icon asset
  const ICONS = {
    'likely_ai': chrome.runtime.getURL('icons/ai-red.png'),
    'likely_human': chrome.runtime.getURL('icons/human-green.png'),
    'uncertain': chrome.runtime.getURL('icons/uncertain-amber.png'),
  };

  // Utility: find the active video container and place the host relative to it
  function placeOverPlayer() {
    // Try common selectors; first hit wins
    const candidates = [
      // YouTube
      'video.html5-main-video',
      '#player video',
      // TikTok
      'video[playsinline]',
      // Twitter/X
      'article video',
      // FB/IG Reels
      'div[role="dialog"] video',
      'video'
    ];
    let vid = null;
    for (const sel of candidates) {
      vid = document.querySelector(sel);
      if (vid) break;
    }
    if (!vid) return false;

    const rect = vid.getBoundingClientRect();
    // Anchor the host to the player’s top-left
    host.style.position = 'fixed';
    host.style.left = `${Math.max(0, rect.left + 8)}px`;
    host.style.top = `${Math.max(0, rect.top + 8)}px`;
    return true;
  }

  // Fake scorer for demo: replace with your real call to http://localhost:8000/analyze
  async function scoreFrame() {
    // Example verdict cycle just to verify visuals:
    // Replace all of this with your real sampling + fetch to API gateway.
    const roll = Math.random();
    if (roll < 0.33) return { verdict: 'likely_human', score: 0.92 };
    if (roll < 0.66) return { verdict: 'uncertain', score: 0.58 };
    return { verdict: 'likely_ai', score: 0.95 };
  }

  function setBadge({ verdict, score }) {
    // Pick icon path
    const iconPath = ICONS[verdict] || ICONS['uncertain'];
    icon.src = iconPath;

    // Label text
    const label =
      verdict === 'likely_human' ? 'Likely Human' :
      verdict === 'likely_ai' ? 'Likely AI' :
      'Uncertain';

    text.textContent = `TrustLens: ${label}`;
    sub.textContent = `score ${Math.round(score * 100) / 100}`;
  }

  // Poller
  let placed = false;
  async function tick() {
    try {
      // (1) Ensure we’re pinned on top-left of the current player
      if (!placed) placed = placeOverPlayer();
      else placeOverPlayer();

      // (2) Get/update verdict
      const res = await scoreFrame();
      setBadge(res);
    } catch (e) {
      // keep silent; it’s a head-up display
    } finally {
      setTimeout(tick, 2000);
    }
  }

  tick();
})();
