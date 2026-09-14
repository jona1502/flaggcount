import { forwardRef, useState } from 'react';
import type { OverlaySettings } from '../../shared/settings';
import { Badge, Callout, TabPanel, Tabs } from '../components/ui';
import { OverlayDesigner } from '../dashboard/OverlayDesigner';
import { OverlaySetupGuide } from './OverlaySetupGuide';
import { statusBadge, targetTypeLabel } from './OverlayTargetCard';
import type { OverlayTarget } from './overlayTargets';
import { OverlayUrlField } from './OverlayUrlField';

type Section = 'design' | 'setup';

type OverlayEditorProps = {
  target: OverlayTarget;
  isPro: boolean;
  /** `false` where the design of this target cannot be changed, e.g. further counters in the browser dashboard. */
  editable: boolean;
  pending: boolean;
  premiumThemesAllowed: boolean;
  onImportAsset?: (kind: 'logo' | 'background', bytes: number[]) => Promise<string>;
  onChange: (overlay: OverlaySettings) => void;
  onCopy: (url: string) => Promise<boolean>;
};

const UNAVAILABLE: Record<OverlayTarget['status'], string> = {
  ready: 'Noch nicht verfügbar.',
  'pro-required': 'Dieses Overlay gehört zu FlagCount Pro.',
  paused: 'Das Element läuft mit deinem Tarif gerade nicht.',
  'service-unavailable': 'Verfügbar, sobald der Verbindungsdienst läuft.'
};

/** Design, URLs and setup of exactly one overlay. Its name and type stay visible in the header. */
export const OverlayEditor = forwardRef<HTMLHeadingElement, OverlayEditorProps>(function OverlayEditor(
  { target, isPro, editable, pending, premiumThemesAllowed, onImportAsset, onChange, onCopy },
  titleRef
) {
  const [section, setSection] = useState<Section>('design');
  const badge = statusBadge(target.status, isPro);

  return (
    <section className="overlay-editor" aria-labelledby="overlay-editor-title">
      <header className="overlay-editor-header">
        <div>
          <p className="overlay-editor-eyebrow">Overlay für</p>
          <h2 id="overlay-editor-title" ref={titleRef} tabIndex={-1} className="overlay-editor-title">
            {target.label}
          </h2>
          <p className="overlay-editor-type">{targetTypeLabel(target)}</p>
        </div>
        <div className="overlay-editor-badges">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {target.available && <Badge tone={target.publicUrl ? 'info' : 'neutral'}>{target.publicUrl ? 'Online-URL aktiv' : 'Nur lokal'}</Badge>}
        </div>
      </header>

      <div className="overlay-editor-urls">
        <OverlayUrlField
          id="overlay-local-url"
          label="Lokale URL"
          hint={target.classic ? 'Die bewährte Adresse – bestehende OBS-Quellen funktionieren weiter.' : 'Für OBS auf diesem Computer.'}
          url={target.localUrl}
          unavailableText={UNAVAILABLE[target.status]}
          onCopy={onCopy}
        />
        <OverlayUrlField
          id="overlay-public-url"
          label="Online-URL"
          hint="Für TikTok LIVE Studio und OBS auf anderen Geräten."
          url={target.publicUrl}
          unavailableText={target.available ? 'Erscheint, sobald der Online-Dienst erreichbar ist.' : UNAVAILABLE[target.status]}
          onCopy={onCopy}
        />
      </div>

      <Tabs
        label="Overlay-Bereiche"
        idPrefix="overlay-editor"
        items={[
          { id: 'design', label: target.kind === 'board' ? 'Vorschau' : 'Design' },
          { id: 'setup', label: 'Einrichtung' }
        ]}
        value={section}
        onChange={setSection}
      />

      <TabPanel idPrefix="overlay-editor" id={section}>
        {section === 'setup' ? (
          <OverlaySetupGuide target={target} />
        ) : target.kind === 'board' ? (
          <div className="overlay-board-preview">
            <Callout tone="info" title="Alle Elemente in einem Overlay">
              Die Gesamtansicht ordnet alle laufenden Zähler und Abstimmungen in einem festen Raster an. Jedes Element erscheint mit seinem eigenen
              Design – bearbeite dafür das jeweilige Element.
            </Callout>
            {target.localUrl && (
              <figure className="overlay-preview-frame">
                <div className="overlay-preview">
                  <iframe title="Vorschau der Gesamtansicht" src={target.localUrl} />
                </div>
              </figure>
            )}
          </div>
        ) : editable && target.overlay ? (
          <OverlayDesigner
            key={target.id}
            settings={target.overlay}
            previewUrl={target.localUrl}
            disabled={pending}
            onChange={onChange}
            premiumThemesAllowed={premiumThemesAllowed}
            onImportAsset={onImportAsset}
          />
        ) : (
          <Callout tone="info" title="Design in der Desktop-App bearbeiten">
            Im Browser-Dashboard lässt sich nur das Design des ersten Elements ändern.
          </Callout>
        )}
      </TabPanel>
    </section>
  );
});
