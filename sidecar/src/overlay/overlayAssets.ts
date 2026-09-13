import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';

/** Strict policy: no inline scripts or styles, only same-origin assets and the event stream. */
export const OVERLAY_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'";

export function renderOverlayPage(votes: VoteSnapshot, overlay: OverlaySettings = DEFAULT_OVERLAY_SETTINGS): string {
  const count = Math.max(0, Math.trunc(votes.count));
  const target = Math.max(1, Math.trunc(votes.target));
  const reached = votes.targetReached ? 'true' : 'false';
  const background = overlay.showBackground ? 'true' : 'false';
  const progress = overlay.showProgress ? 'true' : 'false';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlagCount Overlay</title>
<link rel="stylesheet" href="/overlay/overlay.css">
<script src="/overlay/overlay.js" defer></script>
</head>
<body>
<div class="overlay" id="overlay" data-count="${count}" data-target="${target}" data-reached="${reached}" data-background="${background}" data-progress="${progress}" data-connected="true">
<div class="headline"><span class="flag" aria-hidden="true">🚩</span><span class="count" id="count">${count}</span><span class="separator">/</span><span class="target" id="target">${target}</span></div>
<div class="bar"><div class="bar-fill" id="bar-fill"></div></div>
</div>
</body>
</html>
`;
}

export const OVERLAY_CSS = `html,
body {
  margin: 0;
  overflow: hidden;
  background: transparent;
}

body {
  color: #fff;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.overlay {
  display: inline-flex;
  flex-direction: column;
  gap: 12px;
  min-width: 320px;
  padding: 16px 24px;
  border-radius: 16px;
  background: rgba(15, 15, 20, 0.72);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  transition: opacity 0.3s ease;
}

.overlay[data-background='false'] {
  background: transparent;
}

.headline {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 56px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1;
}

.flag {
  font-size: 44px;
}

.separator,
.target {
  color: rgba(255, 255, 255, 0.72);
  font-size: 36px;
}

.bar {
  height: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
}

.overlay[data-progress='false'] .bar {
  display: none;
}

.bar-fill {
  width: 0;
  height: 100%;
  background: #e82634;
  transition: width 0.3s ease;
}

.overlay[data-reached='true'] .bar-fill {
  background: #3ecf8e;
}

.overlay[data-connected='false'] {
  opacity: 0.5;
}
`;

export const OVERLAY_SCRIPT = `(function () {
  var format = new Intl.NumberFormat('de-DE');
  var root = document.getElementById('overlay');
  var count = document.getElementById('count');
  var target = document.getElementById('target');
  var fill = document.getElementById('bar-fill');

  function render(votes) {
    count.textContent = format.format(votes.count);
    target.textContent = format.format(votes.target);
    var percent = votes.target > 0 ? Math.min(100, (votes.count / votes.target) * 100) : 0;
    fill.style.width = percent + '%';
    root.dataset.reached = votes.targetReached ? 'true' : 'false';
  }

  render({
    count: Number(root.dataset.count),
    target: Number(root.dataset.target),
    targetReached: root.dataset.reached === 'true'
  });

  // EventSource reconnects on its own after the app or the connection restarts.
  var source = new EventSource('/overlay/events');
  source.addEventListener('votes', function (event) {
    try {
      render(JSON.parse(event.data));
      root.dataset.connected = 'true';
    } catch (error) {
      // Ignore malformed updates and keep the last known state.
    }
  });
  source.addEventListener('settings', function (event) {
    try {
      var settings = JSON.parse(event.data);
      root.dataset.background = settings.showBackground ? 'true' : 'false';
      root.dataset.progress = settings.showProgress ? 'true' : 'false';
    } catch (error) {
      // Ignore malformed updates and keep the last known settings.
    }
  });
  source.addEventListener('open', function () {
    root.dataset.connected = 'true';
  });
  source.addEventListener('error', function () {
    root.dataset.connected = 'false';
  });
})();
`;
