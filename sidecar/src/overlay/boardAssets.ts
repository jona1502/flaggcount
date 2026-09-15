import { DEFAULT_BOARD_LAYOUT, type BoardLayout, type CounterView } from '../../../shared/overlayBoard';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audience Live Overlay</title>
<link rel="stylesheet" href="/overlay/board.css">`;

/**
 * Overlay for one counter or all running counters. The initial state travels as JSON in a data
 * attribute, because the CSP forbids inline scripts; the script only ever writes it as text.
 */
export function renderBoardPage(
  counters: CounterView[],
  options: { eventsUrl?: string; scope: string; layout?: BoardLayout; preview?: boolean }
): string {
  return `<!doctype html>
<html lang="de">
<head>
${HEAD}
<script src="/overlay/board.js" defer></script>
</head>
<body>
<div class="board" id="board" data-scope="${escapeAttribute(options.scope)}" data-events="${escapeAttribute(options.eventsUrl ?? '')}"${options.preview ? ' data-preview="true"' : ''} data-initial="${escapeAttribute(JSON.stringify({ counters, layout: options.layout ?? DEFAULT_BOARD_LAYOUT }))}" data-connected="true"></div>
</body>
</html>
`;
}

/** A calm page instead of a broken overlay, e.g. when the overlay needs Audience Live Pro. */
export function renderOverlayNotice(message: string): string {
  return `<!doctype html>
<html lang="de">
<head>
${HEAD}
</head>
<body>
<p class="notice">${escapeAttribute(message)}</p>
</body>
</html>
`;
}

export const BOARD_CSS = `html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.board {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: max-content;
  min-width: 420px;
  transform-origin: 0 0;
  transition: opacity 0.3s ease;
}

.board[data-connected='false'] {
  opacity: 0.5;
}

.card {
  box-sizing: border-box;
  padding: 22px 32px 28px;
  border-radius: 28px;
  color: var(--text, #ffffff);
  background: var(--panel, rgba(12, 12, 16, 0.8));
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08);
  text-shadow: 0 3px 10px rgba(0, 0, 0, 0.55);
}

.card[data-background='false'] {
  background: transparent;
  box-shadow: none;
}

.card[data-theme='minimal'] { padding: 14px 18px; border-radius: 8px; box-shadow: none; }
.card[data-theme='glass'] { backdrop-filter: blur(18px) saturate(140%); background: color-mix(in srgb, var(--panel) 72%, transparent); border: 1px solid rgba(255,255,255,.28); }
.card[data-theme='neon'] { border: 2px solid var(--accent); box-shadow: 0 0 18px var(--accent), inset 0 0 22px rgba(0,0,0,.45); }
.card[data-theme='scoreboard'] { border-radius: 4px; border: 4px solid currentColor; font-family: ui-monospace, 'Cascadia Mono', monospace; text-transform: uppercase; }
.card[data-theme='vertical-poll'] .options { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); align-items: end; }
.card[data-theme='vertical-poll'] .option { display: flex; min-height: 260px; flex-direction: column-reverse; }
.card[data-theme='vertical-poll'] .option .bar { flex: 1; width: 54px; margin: 8px auto; }
.card[data-theme='vertical-poll'] .option .bar-fill { width: 100% !important; transform-origin: bottom; }
.card[data-font='inter'] { font-family: Inter, 'Segoe UI', sans-serif; }
.card[data-font='space-grotesk'] { font-family: 'Space Grotesk', 'Segoe UI', sans-serif; }
.card[data-font='roboto-slab'] { font-family: 'Roboto Slab', Georgia, serif; }
.brand-logo { display: block; max-width: 180px; max-height: 90px; margin: 0 0 12px auto; object-fit: contain; }

/* Scene entries have their own size; zoom keeps the layout around them correct. */
.card {
  zoom: var(--item-scale, 1);
}

/* The emoji of a single counter, animated like the flag of the classic overlay. */
.card-icon {
  display: inline-block;
  align-self: center;
  font-size: 80px;
  transform-origin: 30% 90%;
}

.card[data-flag-animation='wave'] .card-icon {
  animation: icon-wave 1.6s ease-in-out infinite;
}

.card-icon.vote-bounce {
  animation: icon-bounce 0.6s cubic-bezier(0.3, 1.6, 0.5, 1);
}

.card-icon.vote-pulse {
  animation: icon-pulse 0.5s ease-out;
}

/* A short cross-fade when the live overlay switches to another scene. */
.board.is-switching {
  animation: board-switch 0.2s ease-out;
}

@keyframes icon-wave {
  0%,
  100% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(7deg) skewY(-4deg);
  }
}

@keyframes icon-bounce {
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

@keyframes icon-pulse {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes board-switch {
  from {
    opacity: 0;
  }
}

.card-title {
  margin: 0 0 12px;
  font-size: 36px;
  font-weight: 700;
  line-height: 1.15;
}

.card-total {
  display: flex;
  align-items: baseline;
  gap: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.card-count {
  font-size: 104px;
  letter-spacing: -0.03em;
}

.card-target {
  font-size: 58px;
  opacity: 0.7;
}

.bar {
  height: 20px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.bar-fill {
  width: 0;
  height: 100%;
  border-radius: inherit;
  background-color: var(--accent, #e82634);
  transition: width 0.4s ease;
}

.card[data-reached='true'] .card-total + .bar .bar-fill {
  background-color: #2fbf7f;
}

.card[data-progress='false'] .bar {
  display: none;
}

.options {
  display: grid;
  gap: 16px;
  min-width: 560px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.option-head {
  display: flex;
  justify-content: space-between;
  gap: 28px;
  font-size: 36px;
  font-weight: 700;
  white-space: nowrap;
}

.option-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.option .bar {
  display: block;
  height: 18px;
  margin-top: 8px;
}

.notice {
  display: inline-block;
  margin: 24px;
  padding: 16px 22px;
  border-radius: 14px;
  color: #ffffff;
  background: rgba(12, 12, 16, 0.85);
  font-size: 22px;
}

@media (prefers-reduced-motion: reduce) {
  .board,
  .bar-fill {
    transition: none;
  }

  .board,
  .card-icon {
    animation: none !important;
  }
}
`;

export const BOARD_SCRIPT = `(function () {
  var format = new Intl.NumberFormat('de-DE');
  var root = document.getElementById('board');
  var HEX_COLOR = /^#[0-9a-f]{6}$/i;
  var EDGE_GAP = 0.04;
  var size = 0.92;
  var position = 'center';
  var horizontalAlign = 'center';
  var verticalAlign = 'center';
  var sizing = 'fill';
  var lastKey = null;
  var lastCounts = {};
  // Only the app itself may fill the preview page with unsaved scenes.
  var PREVIEW_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'http://localhost:1420'];

  function rgba(hex, alpha) {
    var value = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((value >> 16) & 255) + ', ' + ((value >> 8) & 255) + ', ' + (value & 255) + ', ' + alpha + ')';
  }

  // Every text from the app is written with textContent, never as HTML.
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function fit() {
    var width = root.offsetWidth;
    var height = root.offsetHeight;
    if (!width || !height) return;
    var viewWidth = window.innerWidth;
    var viewHeight = window.innerHeight;
    var scale = Math.min((viewWidth * size) / width, (viewHeight * size) / height);
    if (sizing === 'canvas') {
      // Scenes are sized for a 1280 x 720 stream, so the preview in the app matches every browser source.
      scale = Math.min(scale, Math.min(viewWidth / 1280, viewHeight / 720) * size);
    }
    var scaledHeight = height * scale;
    var gap = viewHeight * EDGE_GAP;
    var y = (viewHeight - scaledHeight) / 2;
    if (verticalAlign === 'start' || position === 'top') y = gap;
    if (verticalAlign === 'end' || position === 'bottom') y = viewHeight - scaledHeight - gap;
    y = Math.max(0, Math.min(y, viewHeight - scaledHeight));
    var x = (viewWidth - width * scale) / 2;
    if (horizontalAlign === 'start') x = gap;
    if (horizontalAlign === 'end') x = viewWidth - width * scale - gap;
    root.style.transform = 'translate(' + Math.round(x * 100) / 100 + 'px, ' + Math.round(y * 100) / 100 + 'px) scale(' + scale + ')';
  }

  function applyDesign(card, overlay) {
    if (!overlay) return;
    card.setAttribute('data-background', overlay.showBackground ? 'true' : 'false');
    card.setAttribute('data-progress', overlay.showProgress ? 'true' : 'false');
    card.setAttribute('data-theme', String(overlay.theme || 'standard'));
    card.setAttribute('data-font', String(overlay.font || 'system'));
    card.setAttribute('data-flag-animation', String(overlay.flagAnimation || 'none'));
    if (overlay.backgroundAsset) card.style.backgroundImage = 'url(/overlay/assets/' + encodeURIComponent(overlay.backgroundAsset) + ')';
    if (HEX_COLOR.test(overlay.accentColor)) card.style.setProperty('--accent', overlay.accentColor);
    if (HEX_COLOR.test(overlay.textColor)) card.style.setProperty('--text', overlay.textColor);
    var opacity = Number(overlay.backgroundOpacity);
    if (HEX_COLOR.test(overlay.backgroundColor) && opacity >= 0 && opacity <= 100) {
      card.style.setProperty('--panel', rgba(overlay.backgroundColor, opacity / 100));
    }
  }

  function bar(percent, color) {
    var track = element('div', 'bar');
    var fill = element('div', 'bar-fill');
    fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
    if (color && HEX_COLOR.test(color)) fill.style.backgroundColor = color;
    track.appendChild(fill);
    return track;
  }

  function renderCounter(view) {
    var id = view.itemId || view.counterId;
    var previous = lastCounts[id];
    lastCounts[id] = Number(view.totalCount) || 0;
    var card = element('section', 'card');
    var itemScale = Number(view.itemScale);
    if (itemScale >= 40 && itemScale <= 160) card.style.setProperty('--item-scale', String(itemScale / 100));
    applyDesign(card, view.overlay);
    if (view.overlay && view.overlay.logoAsset) {
      var logo = element('img', 'brand-logo');
      logo.src = '/overlay/assets/' + encodeURIComponent(view.overlay.logoAsset);
      logo.alt = '';
      card.appendChild(logo);
    }
    card.setAttribute('data-reached', view.targetReached ? 'true' : 'false');
    card.appendChild(element('h1', 'card-title', String(view.name)));

    if (view.mode === 'poll') {
      var list = element('ul', 'options');
      var total = Number(view.totalCount) || 0;
      (view.options || []).forEach(function (option) {
        var share = total > 0 ? option.count / total : 0;
        var item = element('li', 'option');
        var head = element('div', 'option-head');
        head.appendChild(element('span', 'option-label', String(option.label)));
        head.appendChild(element('span', 'option-count', format.format(option.count) + ' · ' + Math.round(share * 100) + ' %'));
        item.appendChild(head);
        item.appendChild(bar(share * 100, option.color));
        list.appendChild(item);
      });
      card.appendChild(list);
      return card;
    }

    var totalRow = element('div', 'card-total');
    if (view.icon) {
      var icon = element('span', 'card-icon', String(view.icon));
      icon.setAttribute('aria-hidden', 'true');
      var animation = view.overlay && view.overlay.flagAnimation;
      if (previous !== undefined && lastCounts[id] > previous && (animation === 'bounce' || animation === 'pulse')) {
        icon.classList.add('vote-' + animation);
      }
      totalRow.appendChild(icon);
    }
    totalRow.appendChild(element('span', 'card-count', format.format(view.totalCount)));
    if (view.target) totalRow.appendChild(element('span', 'card-target', '/ ' + format.format(view.target)));
    card.appendChild(totalRow);
    if (view.target) card.appendChild(bar((view.totalCount / view.target) * 100));
    return card;
  }

  function applyLayout(layout, count) {
    layout = layout || {};
    var chosen = layout.layout || 'auto';
    if (chosen === 'auto') chosen = count > 2 ? 'grid' : 'horizontal';
    root.style.display = chosen === 'grid' ? 'grid' : 'flex';
    root.style.flexDirection = chosen === 'horizontal' ? 'row' : 'column';
    root.style.gridTemplateColumns = chosen === 'grid' ? 'repeat(2, max-content)' : '';
    root.style.gap = String(Number.isInteger(layout.gap) ? layout.gap : 18) + 'px';
    sizing = layout.sizing === 'canvas' ? 'canvas' : 'fill';
    horizontalAlign = layout.horizontalAlign || 'center';
    verticalAlign = layout.verticalAlign || 'center';
    // Side by side, cards of different heights line up along the chosen edge instead of stretching.
    var edges = { start: 'flex-start', center: 'center', end: 'flex-end' };
    root.style.alignItems = chosen === 'vertical' ? '' : edges[verticalAlign] || 'center';
    var percent = Number(layout.scale);
    if (percent >= 20 && percent <= 100) size = percent / 100;
  }

  function render(counters, layout) {
    root.textContent = '';
    var key = (counters || []).map(function (view) { return view.itemId || view.counterId; }).join('|');
    if (lastKey !== null && key !== lastKey) {
      root.classList.remove('is-switching');
      void root.offsetWidth;
      root.classList.add('is-switching');
    }
    lastKey = key;
    if (!counters || !counters.length) return;
    applyLayout(layout, counters.length);
    var design = counters[0].overlay;
    if (design) {
      if (!layout) {
        if (design.position === 'top' || design.position === 'center' || design.position === 'bottom') position = design.position;
        var percent = Number(design.size);
        if (percent >= 20 && percent <= 100) size = percent / 100;
      }
    }
    counters.forEach(function (view) {
      root.appendChild(renderCounter(view));
    });
    fit();
  }

  window.addEventListener('resize', fit);
  try {
    var initial = JSON.parse(root.getAttribute('data-initial') || '{}');
    render(initial.counters, initial.layout);
  } catch (error) {
    // Start empty and wait for the event stream.
  }

  if (root.getAttribute('data-preview') === 'true') {
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (PREVIEW_ORIGINS.indexOf(event.origin) < 0 || !data || data.type !== 'audience-live-preview') return;
      render(data.counters, data.layout);
    });
    // Tell the app the preview is ready; the message itself carries no data.
    if (window.parent !== window) window.parent.postMessage({ type: 'audience-live-preview-ready' }, '*');
    return;
  }

  var source = new EventSource(root.getAttribute('data-events'));
  source.addEventListener('board', function (event) {
    try {
      var update = JSON.parse(event.data);
      render(update.counters, update.layout);
      root.setAttribute('data-connected', 'true');
    } catch (error) {
      // Ignore malformed updates and keep the last known state.
    }
  });
  source.addEventListener('open', function () {
    root.setAttribute('data-connected', 'true');
  });
  source.addEventListener('error', function () {
    root.setAttribute('data-connected', 'false');
  });
})();
`;
