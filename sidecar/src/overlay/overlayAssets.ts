import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';

/** Strict policy: no inline scripts or styles, only same-origin assets and the event stream. */
export const OVERLAY_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'";

export type OverlayPageOptions = {
  /** Event stream of this overlay; the online overlays of the web server each have their own. */
  eventsUrl?: string;
};

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderOverlayPage(
  votes: VoteSnapshot,
  overlay: OverlaySettings = DEFAULT_OVERLAY_SETTINGS,
  options: OverlayPageOptions = {}
): string {
  const eventsUrl = escapeAttribute(options.eventsUrl ?? '/overlay/events');
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
<div class="overlay" id="overlay" data-count="${count}" data-target="${target}" data-reached="${reached}" data-background="${background}" data-progress="${progress}" data-events="${eventsUrl}" data-connected="true">
<div class="headline"><span class="flag" aria-hidden="true">🚩</span><span class="count" id="count">${count}</span><span class="separator">/</span><span class="target" id="target">${target}</span></div>
<div class="bar"><div class="bar-fill" id="bar-fill"></div></div>
</div>
</body>
</html>
`;
}

export const OVERLAY_CSS = `html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
}

body {
  color: #fff;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

/* Streaming tools render the source at their own size; the script scales the overlay to fill it. */
.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
  width: max-content;
  min-width: 440px;
  padding: 28px 40px 34px;
  border-radius: 32px;
  background: rgba(12, 12, 16, 0.8);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08);
  text-shadow: 0 3px 10px rgba(0, 0, 0, 0.55);
  transform: translate(-50%, -50%);
  transform-origin: center;
  transition: opacity 0.3s ease;
}

.overlay[data-background='false'] {
  background: transparent;
  box-shadow: none;
}

.headline {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.flag {
  align-self: center;
  font-size: 80px;
}

.count {
  font-size: 128px;
  letter-spacing: -0.03em;
  text-align: right;
}

.separator,
.target {
  color: rgba(255, 255, 255, 0.68);
  font-size: 72px;
  font-weight: 700;
}

.bar {
  height: 24px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.overlay[data-progress='false'] .bar {
  display: none;
}

.bar-fill {
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #e82634, #ff4d5a);
  transition: width 0.4s ease;
}

.overlay[data-reached='true'] .bar-fill {
  background: linear-gradient(90deg, #2fbf7f, #52e0a0);
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
  // Share of the source the overlay may cover, leaving a small margin.
  var FILL = 0.92;

  // Streaming tools like TikTok LIVE Studio render the page larger than their source frame and
  // scale it down, so fixed sizes end up tiny. Scale the overlay to fit the page instead.
  // The overlay is centered by its stylesheet; offsetWidth/offsetHeight ignore the transform.
  function fit() {
    var width = root.offsetWidth;
    var height = root.offsetHeight;
    if (!width || !height) return;
    var scale = Math.min((window.innerWidth * FILL) / width, (window.innerHeight * FILL) / height);
    root.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
  }

  function render(votes) {
    var targetText = format.format(votes.target);
    count.textContent = format.format(votes.count);
    target.textContent = targetText;
    // Reserve the target's width, so the size stays put while the count grows during a round.
    count.style.minWidth = targetText.length + 'ch';
    var percent = votes.target > 0 ? Math.min(100, (votes.count / votes.target) * 100) : 0;
    fill.style.width = percent + '%';
    root.dataset.reached = votes.targetReached ? 'true' : 'false';
    fit();
  }

  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fit);
  }

  render({
    count: Number(root.dataset.count),
    target: Number(root.dataset.target),
    targetReached: root.dataset.reached === 'true'
  });

  // EventSource reconnects on its own after the app or the connection restarts.
  var source = new EventSource(root.dataset.events || '/overlay/events');
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
      fit();
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
