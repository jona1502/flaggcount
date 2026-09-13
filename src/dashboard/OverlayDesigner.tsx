import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_OVERLAY_SETTINGS,
  FLAG_ANIMATIONS,
  MAX_OVERLAY_SIZE,
  MIN_OVERLAY_SIZE,
  OVERLAY_POSITIONS,
  OVERLAY_FONTS,
  OVERLAY_THEMES,
  TARGET_EFFECTS,
  type FlagAnimation,
  type OverlayPosition,
  type OverlaySettings,
  type OverlayFont,
  type OverlayTheme,
  type TargetEffect
} from '../../shared/settings';

type OverlayDesignerProps = {
  settings: OverlaySettings;
  /** Overlay address for the live preview; `null` while it is not available. */
  previewUrl: string | null;
  /** Blocks the switches while an action is pending. */
  disabled: boolean;
  onChange: (overlay: OverlaySettings) => void;
  /** Color pickers and sliders save after this pause, so dragging does not save every step. */
  saveDelayMs?: number;
  premiumThemesAllowed?: boolean;
  onImportAsset?: (kind: 'logo' | 'background', bytes: number[]) => Promise<string>;
};

const POSITION_LABELS: Record<OverlayPosition, string> = {
  top: 'Oben',
  center: 'Mitte',
  bottom: 'Unten'
};

const FLAG_ANIMATION_LABELS: Record<FlagAnimation, string> = {
  none: 'Keine',
  wave: 'Wehen (dauerhaft)',
  bounce: 'Hüpfen bei jeder Stimme',
  pulse: 'Pulsieren bei jeder Stimme'
};

const TARGET_EFFECT_LABELS: Record<TargetEffect, string> = {
  none: 'Kein Effekt',
  glow: 'Leuchten',
  confetti: 'Konfetti'
};

const THEME_LABELS: Record<OverlayTheme, string> = {
  standard: 'Standard',
  minimal: 'Minimal · Pro',
  glass: 'Glass · Pro',
  neon: 'Neon · Pro',
  scoreboard: 'Scoreboard · Pro',
  'vertical-poll': 'Vertikale Umfrage · Pro'
};
const FONT_LABELS: Record<OverlayFont, string> = {
  system: 'Systemstandard', inter: 'Inter', 'space-grotesk': 'Space Grotesk', 'roboto-slab': 'Roboto Slab'
};

function isDefault(settings: OverlaySettings): boolean {
  return (Object.keys(DEFAULT_OVERLAY_SETTINGS) as (keyof OverlaySettings)[]).every(
    (key) => settings[key] === DEFAULT_OVERLAY_SETTINGS[key]
  );
}

type FieldProps<Value> = {
  id: string;
  label: string;
  value: Value;
  disabled?: boolean;
  onChange: (value: Value) => void;
};

function ColorField({ id, label, value, onChange }: FieldProps<string>): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange
}: FieldProps<number> & { min: number; max: number; step: number }): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="range-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {/* The slider itself exposes its value; <output> would add a second live "status" region. */}
        <span className="range-value" aria-hidden="true">
          {value} %
        </span>
      </div>
    </div>
  );
}

function SelectField<Value extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange
}: FieldProps<Value> & { options: readonly Value[]; labels: Record<Value, string> }): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as Value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Lets the streamer design the overlay and watch the result in a live preview. */
export function OverlayDesigner({
  settings,
  previewUrl,
  disabled,
  onChange,
  saveDelayMs = 300,
  premiumThemesAllowed = false,
  onImportAsset
}: OverlayDesignerProps): React.JSX.Element {
  const [draft, setDraft] = useState(settings);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; next: OverlaySettings } | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Adopt settings from the app, unless a local edit is still waiting to be saved.
  useEffect(() => {
    if (!pending.current) setDraft(settings);
  }, [settings]);

  // Closing the dashboard must not lose the last change.
  useEffect(
    () => () => {
      const waiting = pending.current;
      if (waiting) {
        clearTimeout(waiting.timer);
        onChangeRef.current(waiting.next);
      }
    },
    []
  );

  const save = (next: OverlaySettings, delayed: boolean): void => {
    setDraft(next);
    if (pending.current) clearTimeout(pending.current.timer);
    if (!delayed) {
      pending.current = null;
      onChange(next);
      return;
    }
    const timer = setTimeout(() => {
      pending.current = null;
      onChangeRef.current(next);
    }, saveDelayMs);
    pending.current = { timer, next };
  };

  const change = <Key extends keyof OverlaySettings>(key: Key, value: OverlaySettings[Key], delayed = false): void =>
    save({ ...draft, [key]: value }, delayed);

  const importAsset = async (kind: 'logo' | 'background', file: File | undefined): Promise<void> => {
    if (!file || !onImportAsset) return;
    const name = await onImportAsset(kind, [...new Uint8Array(await file.arrayBuffer())]);
    change(kind === 'logo' ? 'logoAsset' : 'backgroundAsset', name);
  };

  return (
    <div className="designer">
      <div className="designer-controls">
        <fieldset className="designer-group">
          <legend>Vorlage</legend>
          <SelectField
            id="overlay-theme"
            label="Overlay-Vorlage"
            value={draft.theme}
            options={premiumThemesAllowed ? OVERLAY_THEMES : ['standard']}
            labels={THEME_LABELS}
            onChange={(value) => change('theme', value)}
          />
          {!premiumThemesAllowed && <p className="hint"><span className="pro-tag">Pro</span> Fünf zusätzliche Vorlagen freischalten.</p>}
        </fieldset>
        <fieldset className="overlay-options" disabled={disabled}>
          <legend>Darstellung</legend>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.showBackground}
              disabled={disabled}
              onChange={(event) => change('showBackground', event.target.checked)}
            />
            Hintergrund anzeigen
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.showProgress}
              disabled={disabled}
              onChange={(event) => change('showProgress', event.target.checked)}
            />
            Fortschrittsbalken anzeigen
          </label>
        </fieldset>

        <fieldset className="designer-group">
          <legend>Farben</legend>
          <div className="designer-fields">
            <ColorField
              id="overlay-accent-color"
              label="Balken & Akzent"
              value={draft.accentColor}
              onChange={(value) => change('accentColor', value, true)}
            />
            <ColorField
              id="overlay-text-color"
              label="Schrift"
              value={draft.textColor}
              onChange={(value) => change('textColor', value, true)}
            />
            <ColorField
              id="overlay-background-color"
              label="Hintergrund"
              value={draft.backgroundColor}
              onChange={(value) => change('backgroundColor', value, true)}
            />
            <RangeField
              id="overlay-background-opacity"
              label="Deckkraft"
              min={0}
              max={100}
              step={5}
              value={draft.backgroundOpacity}
              disabled={!draft.showBackground}
              onChange={(value) => change('backgroundOpacity', value, true)}
            />
          </div>
        </fieldset>

        <fieldset className="designer-group">
          <legend>Layout</legend>
          <div className="designer-fields">
            <SelectField
              id="overlay-position"
              label="Position"
              value={draft.position}
              options={OVERLAY_POSITIONS}
              labels={POSITION_LABELS}
              onChange={(value) => change('position', value)}
            />
            <RangeField
              id="overlay-size"
              label="Größe"
              min={MIN_OVERLAY_SIZE}
              max={MAX_OVERLAY_SIZE}
              step={1}
              value={draft.size}
              onChange={(value) => change('size', value, true)}
            />
          </div>
        </fieldset>

        <fieldset className="designer-group">
          <legend>Animation</legend>
          <div className="designer-fields">
            <SelectField
              id="overlay-flag-animation"
              label="Flagge"
              value={draft.flagAnimation}
              options={FLAG_ANIMATIONS}
              labels={FLAG_ANIMATION_LABELS}
              onChange={(value) => change('flagAnimation', value)}
            />
            <SelectField
              id="overlay-target-effect"
              label="Ziel erreicht"
              value={draft.targetEffect}
              options={TARGET_EFFECTS}
              labels={TARGET_EFFECT_LABELS}
              onChange={(value) => change('targetEffect', value)}
            />
          </div>
        </fieldset>

        <fieldset className="designer-group" disabled={!onImportAsset || disabled}>
          <legend>Branding <span className="pro-tag">Pro</span></legend>
          <SelectField id="overlay-font" label="Schrift" value={draft.font} options={OVERLAY_FONTS} labels={FONT_LABELS} onChange={(value) => change('font', value)} />
          <label htmlFor="overlay-logo">Logo (PNG, JPEG oder WebP, max. 2 MB)</label>
          <input id="overlay-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void importAsset('logo', event.target.files?.[0])} />
          <label htmlFor="overlay-background">Hintergrundbild (max. 5 MB)</label>
          <input id="overlay-background" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void importAsset('background', event.target.files?.[0])} />
          {(draft.logoAsset || draft.backgroundAsset) && <button type="button" className="button secondary" onClick={() => save({ ...draft, logoAsset: null, backgroundAsset: null }, false)}>Branding-Bilder entfernen</button>}
        </fieldset>

        <button
          type="button"
          className="button secondary designer-reset"
          disabled={isDefault(draft)}
          onClick={() => save({ ...DEFAULT_OVERLAY_SETTINGS }, false)}
        >
          Standard wiederherstellen
        </button>
      </div>

      {previewUrl && (
        <figure className="overlay-preview-frame">
          <div className="overlay-preview">
            <iframe title="Vorschau des Overlays" src={previewUrl} />
          </div>
          <figcaption className="hint">Live-Vorschau: Stimmen und Änderungen erscheinen hier sofort.</figcaption>
        </figure>
      )}
    </div>
  );
}
