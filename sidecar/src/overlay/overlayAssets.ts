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
  // The values are validated upstream, but the page is built from strings, so escape them anyway.
  const appearance = [
    `data-accent="${escapeAttribute(overlay.accentColor)}"`,
    `data-text="${escapeAttribute(overlay.textColor)}"`,
    `data-panel="${escapeAttribute(overlay.backgroundColor)}"`,
    `data-panel-opacity="${Math.trunc(overlay.backgroundOpacity)}"`,
    `data-position="${escapeAttribute(overlay.position)}"`,
    `data-size="${Math.trunc(overlay.size)}"`,
    `data-flag-animation="${escapeAttribute(overlay.flagAnimation)}"`,
    `data-target-effect="${escapeAttribute(overlay.targetEffect)}"`
  ].join(' ');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audience Live Overlay</title>
<link rel="stylesheet" href="/overlay/overlay.css">
<script src="/overlay/overlay.js" defer></script>
</head>
<body>
<div class="overlay" id="overlay" data-count="${count}" data-target="${target}" data-reached="${reached}" data-background="${background}" data-progress="${progress}" ${appearance} data-events="${eventsUrl}" data-connected="true">
<div class="headline"><span class="flag" id="flag" aria-hidden="true">🚩</span><span class="count" id="count">${count}</span><span class="separator">/</span><span class="target" id="target">${target}</span></div>
<div class="bar"><div class="bar-fill" id="bar-fill"></div></div>
<div class="confetti" id="confetti" aria-hidden="true"></div>
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

/*
 * Streaming tools render the source at their own size; the script scales and places the overlay.
 * Colors come from the settings as custom properties (no color-mix: older OBS browsers lack it).
 */
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
  width: max-content;
  min-width: 440px;
  padding: 28px 40px 34px;
  border-radius: 32px;
  color: var(--text, #ffffff);
  background: var(--panel, rgba(12, 12, 16, 0.8));
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08);
  text-shadow: 0 3px 10px rgba(0, 0, 0, 0.55);
  transform-origin: 0 0;
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
  display: inline-block;
  align-self: center;
  font-size: 80px;
  transform-origin: 30% 90%;
}

.count {
  font-size: 128px;
  letter-spacing: -0.03em;
  text-align: right;
}

.separator,
.target {
  font-size: 72px;
  font-weight: 700;
  opacity: 0.7;
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
  background-color: var(--accent, #e82634);
  background-image: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.22));
  transition: width 0.4s ease;
}

.overlay[data-reached='true'] .bar-fill {
  background-color: #2fbf7f;
}

.overlay[data-connected='false'] {
  opacity: 0.5;
}

/* Flag animations: "wave" runs continuously, the others play on every new vote. */
.overlay[data-flag-animation='wave'] .flag {
  animation: flag-wave 1.6s ease-in-out infinite;
}

.flag.vote-bounce {
  animation: flag-bounce 0.6s cubic-bezier(0.3, 1.6, 0.5, 1);
}

.flag.vote-pulse {
  animation: flag-pulse 0.5s ease-out;
}

.count.vote-pop {
  animation: count-pop 0.35s ease-out;
}

/* Target effects */
.overlay[data-target-effect='glow'][data-reached='true'] {
  animation: target-glow 1.4s ease-in-out infinite;
}

.confetti {
  position: absolute;
  top: 45%;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}

.confetti-piece {
  position: absolute;
  width: 16px;
  height: 26px;
  border-radius: 3px;
  opacity: 0;
  animation: confetti-burst 1.9s cubic-bezier(0.15, 0.7, 0.4, 1) var(--delay, 0ms) forwards;
}

@keyframes flag-wave {
  0%,
  100% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(7deg) skewY(-4deg);
  }
}

@keyframes flag-bounce {
  0% {
    transform: translateY(0);
  }
  35% {
    transform: translateY(-38%) scale(1.08);
  }
  65% {
    transform: translateY(6%) scale(0.96);
  }
  100% {
    transform: none;
  }
}

@keyframes flag-pulse {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.35);
    filter: drop-shadow(0 0 18px var(--accent, #e82634));
  }
  100% {
    transform: scale(1);
  }
}

@keyframes count-pop {
  40% {
    transform: scale(1.08);
  }
}

@keyframes target-glow {
  0%,
  100% {
    box-shadow: inset 0 0 0 2px rgba(47, 191, 127, 0.5), 0 0 24px 2px rgba(47, 191, 127, 0.35);
  }
  50% {
    box-shadow: inset 0 0 0 2px rgba(47, 191, 127, 0.9), 0 0 56px 10px rgba(47, 191, 127, 0.6);
  }
}

@keyframes confetti-burst {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg);
  }
  45% {
    opacity: 1;
    transform: translate(var(--x), var(--y)) rotate(var(--r));
  }
  100% {
    opacity: 0;
    transform: translate(var(--x), calc(var(--y) + 420px)) rotate(calc(var(--r) * 2));
  }
}
`;

export const OVERLAY_SCRIPT = `(function () {
  var format = new Intl.NumberFormat('de-DE');
  var root = document.getElementById('overlay');
  var count = document.getElementById('count');
  var target = document.getElementById('target');
  var fill = document.getElementById('bar-fill');
  var flag = document.getElementById('flag');
  var confetti = document.getElementById('confetti');
  var HEX_COLOR = /^#[0-9a-f]{6}$/i;
  var FLAG_ANIMATIONS = ['none', 'wave', 'bounce', 'pulse'];
  var TARGET_EFFECTS = ['none', 'glow', 'confetti'];
  var CONFETTI_PIECES = 48;
  var CONFETTI_MS = 2200;
  var flagAnimation = 'none';
  var targetEffect = 'none';
  // State of the previous render; null until the page has rendered once.
  var lastCount = null;
  var lastReached = null;
  // Gap to the source's edge when the overlay sits at the top or bottom.
  var EDGE_GAP = 0.04;
  // Share of the source the overlay may cover and where it sits; replaced by the settings.
  var size = 0.92;
  var position = 'center';

  function rgba(hex, alpha) {
    var value = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((value >> 16) & 255) + ', ' + ((value >> 8) & 255) + ', ' + (value & 255) + ', ' + alpha + ')';
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  // Removing the class and forcing a reflow restarts the animation for rapid votes.
  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function celebrateVote() {
    if (flagAnimation === 'bounce') restartAnimation(flag, 'vote-bounce');
    if (flagAnimation === 'pulse') restartAnimation(flag, 'vote-pulse');
    if (flagAnimation !== 'none') restartAnimation(count, 'vote-pop');
  }

  function burstConfetti() {
    var accent = root.style.getPropertyValue('--accent') || '#e82634';
    var colors = [accent, '#ffd166', '#06d6a0', '#4cc9f0', '#ffffff'];
    for (var i = 0; i < CONFETTI_PIECES; i++) {
      var piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.setProperty('--x', Math.round((Math.random() * 2 - 1) * 520) + 'px');
      piece.style.setProperty('--y', Math.round(-160 - Math.random() * 260) + 'px');
      piece.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
      piece.style.setProperty('--delay', Math.round(Math.random() * 120) + 'ms');
      confetti.appendChild(piece);
    }
    setTimeout(function () {
      confetti.textContent = '';
    }, CONFETTI_MS);
  }

  // Streaming tools like TikTok LIVE Studio render the page larger than their source frame and
  // scale it down, so fixed sizes end up tiny. Scale and place the overlay relative to the page instead.
  // offsetWidth/offsetHeight ignore the transform.
  function fit() {
    var width = root.offsetWidth;
    var height = root.offsetHeight;
    if (!width || !height) return;
    var viewWidth = window.innerWidth;
    var viewHeight = window.innerHeight;
    var scale = Math.min((viewWidth * size) / width, (viewHeight * size) / height);
    var scaledHeight = height * scale;
    var gap = viewHeight * EDGE_GAP;
    var y = (viewHeight - scaledHeight) / 2;
    if (position === 'top') y = gap;
    if (position === 'bottom') y = viewHeight - scaledHeight - gap;
    y = Math.max(0, Math.min(y, viewHeight - scaledHeight));
    var x = (viewWidth - width * scale) / 2;
    root.style.transform = 'translate(' + round(x) + 'px, ' + round(y) + 'px) scale(' + scale + ')';
  }

  // Settings arrive validated, but only well-formed values ever reach the styles.
  function applySettings(settings) {
    root.dataset.background = settings.showBackground ? 'true' : 'false';
    root.dataset.progress = settings.showProgress ? 'true' : 'false';
    if (HEX_COLOR.test(settings.accentColor)) root.style.setProperty('--accent', settings.accentColor);
    if (HEX_COLOR.test(settings.textColor)) root.style.setProperty('--text', settings.textColor);
    var opacity = Number(settings.backgroundOpacity);
    if (HEX_COLOR.test(settings.backgroundColor) && opacity >= 0 && opacity <= 100) {
      root.style.setProperty('--panel', rgba(settings.backgroundColor, opacity / 100));
    }
    if (settings.position === 'top' || settings.position === 'center' || settings.position === 'bottom') {
      position = settings.position;
    }
    var percent = Number(settings.size);
    if (percent >= 20 && percent <= 100) size = percent / 100;
    if (FLAG_ANIMATIONS.indexOf(settings.flagAnimation) >= 0) {
      flagAnimation = settings.flagAnimation;
      root.dataset.flagAnimation = flagAnimation;
    }
    if (TARGET_EFFECTS.indexOf(settings.targetEffect) >= 0) {
      targetEffect = settings.targetEffect;
      root.dataset.targetEffect = targetEffect;
    }
    fit();
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
    // Only changes after the first render celebrate, not the state the page was opened with.
    if (lastCount !== null && votes.count > lastCount) celebrateVote();
    if (lastReached === false && votes.targetReached && targetEffect === 'confetti') burstConfetti();
    lastCount = votes.count;
    lastReached = Boolean(votes.targetReached);
    fit();
  }

  window.addEventListener('resize', fit);
  flag.addEventListener('animationend', function () {
    flag.classList.remove('vote-bounce', 'vote-pulse');
  });
  count.addEventListener('animationend', function () {
    count.classList.remove('vote-pop');
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fit);
  }

  applySettings({
    showBackground: root.dataset.background === 'true',
    showProgress: root.dataset.progress === 'true',
    accentColor: root.dataset.accent,
    textColor: root.dataset.text,
    backgroundColor: root.dataset.panel,
    backgroundOpacity: root.dataset.panelOpacity,
    position: root.dataset.position,
    size: root.dataset.size,
    flagAnimation: root.dataset.flagAnimation,
    targetEffect: root.dataset.targetEffect
  });

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
      applySettings(JSON.parse(event.data));
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
