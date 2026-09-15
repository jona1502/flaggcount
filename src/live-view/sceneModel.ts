import { DEFAULT_BOARD_LAYOUT, buildCounterViews, type BoardLayout, type CounterView } from '../../shared/overlayBoard';
import type { CounterDefinition, OverlaySceneItem, OverlayView, OverlayViewInput } from '../../shared/profiles';
import type { CounterSnapshot } from '../../shared/voting';

/** A scene while it is edited; `id` stays `null` until the scene is created. */
export type SceneDraft = OverlayViewInput & { id: string | null };

/** What a stream overlay receives for one scene. */
export type SceneBoard = { counters: CounterView[]; layout: BoardLayout };

/** New scenes start at the bottom centre, side by side, so the camera image stays free. */
export function newSceneDraft(counters: readonly CounterDefinition[], number: number): SceneDraft {
  return {
    id: null,
    name: `Szene ${number}`,
    items: counters.slice(0, 2).map((counter, index) => ({ id: `i-${index + 1}`, counterId: counter.id, scale: 100 })),
    layout: 'horizontal',
    gap: 24,
    horizontalAlign: 'center',
    verticalAlign: 'end',
    scale: 70
  };
}

export function draftOf({ id, name, items, layout, gap, horizontalAlign, verticalAlign, scale }: OverlayView): SceneDraft {
  return { id, name, items: items.map((item) => ({ ...item })), layout, gap, horizontalAlign, verticalAlign, scale };
}

export function inputOf({ id: _id, ...input }: SceneDraft): OverlayViewInput {
  return { ...input, name: input.name.trim() };
}

/** Two drafts describe the same scene when saving one would not change the other. */
export const sameScene = (a: SceneDraft, b: SceneDraft): boolean => JSON.stringify(inputOf(a)) === JSON.stringify(inputOf(b));

/** The next free entry id. Entries keep their ids, so two entries of the same counter stay apart. */
export function nextItemId(items: readonly OverlaySceneItem[]): string {
  const highest = items.reduce((max, item) => {
    const match = /^i-(\d+)$/.exec(item.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `i-${highest + 1}`;
}

/** Hides or shows one entry. A shown entry carries no flag, exactly like the stored scene. */
export function toggleItem(items: readonly OverlaySceneItem[], id: string): OverlaySceneItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    if (!item.hidden) return { ...item, hidden: true };
    const { hidden: _hidden, ...shown } = item;
    return shown;
  });
}

/** Moves one entry up or down; at either end nothing changes. */
export function moveItem<Item extends { id: string }>(items: readonly Item[], id: string, offset: -1 | 1): Item[] {
  const from = items.findIndex((item) => item.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= items.length) return [...items];
  const moved = [...items];
  [moved[from], moved[to]] = [moved[to] as Item, moved[from] as Item];
  return moved;
}

/** Counters without a running round yet still show up in the preview, at zero. */
function withEmptyRounds(snapshots: readonly CounterSnapshot[], counters: readonly CounterDefinition[]): CounterSnapshot[] {
  return counters.map(
    (counter) =>
      snapshots.find((snapshot) => snapshot.counterId === counter.id) ?? {
        counterId: counter.id,
        name: counter.name,
        mode: counter.mode,
        options: counter.options.map((option) => ({ optionId: option.id, label: option.label, count: 0 })),
        totalCount: 0,
        target: counter.target,
        targetReached: false,
        roundId: ''
      }
  );
}

/**
 * The board of a scene, built exactly like the sidecar builds it for `/overlay/live`. Without a draft it is
 * the automatic scene: every counter below each other, or only the first one on Free. Hidden entries stay out.
 */
export function sceneBoard(
  draft: SceneDraft | null,
  snapshots: readonly CounterSnapshot[],
  counters: readonly CounterDefinition[],
  scenesAllowed: boolean
): SceneBoard {
  const views = buildCounterViews(withEmptyRounds(snapshots, counters), counters);
  if (!draft) {
    return {
      counters: scenesAllowed ? views : views.slice(0, 1),
      layout: { ...DEFAULT_BOARD_LAYOUT, layout: scenesAllowed ? 'vertical' : DEFAULT_BOARD_LAYOUT.layout, sizing: 'canvas' }
    };
  }
  return {
    counters: draft.items.flatMap((item) => {
      const view = item.hidden ? undefined : views.find((candidate) => candidate.counterId === item.counterId);
      return view ? [{ ...view, itemId: item.id, itemScale: item.scale }] : [];
    }),
    layout: {
      layout: draft.layout,
      gap: draft.gap,
      horizontalAlign: draft.horizontalAlign,
      verticalAlign: draft.verticalAlign,
      scale: draft.scale,
      sizing: 'canvas'
    }
  };
}
