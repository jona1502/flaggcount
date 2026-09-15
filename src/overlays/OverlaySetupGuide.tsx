import { useState } from 'react';
import { Callout, TabPanel, Tabs } from '../components/ui';
import { recommendedSize, type OverlayTarget } from './overlayTargets';

type Guide = 'obs' | 'studio' | 'test';

const GUIDES = [
  { id: 'obs', label: 'OBS Studio' },
  { id: 'studio', label: 'TikTok LIVE Studio' },
  { id: 'test', label: 'Testen' }
] as const;

/** Step-by-step setup of the overlay as a browser source. */
export function OverlaySetupGuide({ target }: { target: OverlayTarget }): React.JSX.Element {
  const [guide, setGuide] = useState<Guide>('obs');
  const { width, height } = recommendedSize(target);
  const size = (
    <>
      Breite <strong>{width}</strong> und Höhe <strong>{height}</strong>
    </>
  );

  return (
    <div className="setup-guide">
      <Tabs label="Anleitung" idPrefix="overlay-guide" items={GUIDES} value={guide} onChange={setGuide} />
      <TabPanel idPrefix="overlay-guide" id={guide}>
        {guide === 'obs' && (
          <ol className="guide-steps">
            <li>
              Kopiere die <strong>lokale URL</strong>. Läuft OBS auf einem anderen Computer, nimm die Online-URL.
            </li>
            <li>
              Klicke in OBS unter <strong>Quellen</strong> auf <strong>+</strong> und wähle <strong>Browser</strong>.
            </li>
            <li>Füge die URL ein und trage {size} ein.</li>
            <li>Der Hintergrund ist transparent – das benutzerdefinierte CSS von OBS kann unverändert bleiben.</li>
            <li>
              Lass <strong>Quelle herunterfahren, wenn nicht sichtbar</strong> deaktiviert, damit das Overlay immer aktuell ist.
            </li>
          </ol>
        )}
        {guide === 'studio' && (
          <>
            <ol className="guide-steps">
              <li>
                Kopiere die <strong>Online-URL</strong>. TikTok LIVE Studio kann keine lokalen Adressen öffnen.
              </li>
              <li>
                Füge in LIVE Studio eine Quelle vom Typ <strong>Link</strong> hinzu.
              </li>
              <li>Füge die URL ein und stelle {size} ein.</li>
              <li>Platziere die Quelle über deinem Kamerabild.</li>
            </ol>
            {!target.publicUrl && (
              <Callout tone="warning" title="Die Online-URL ist gerade nicht verfügbar">
                Sie erscheint, sobald Audience Live den Online-Dienst erreicht. Das lokale Overlay funktioniert davon unabhängig.
              </Callout>
            )}
          </>
        )}
        {guide === 'test' && (
          <ol className="guide-steps">
            <li>Öffne die lokale URL in einem Browser auf diesem Computer.</li>
            <li>Füge in der Übersicht eine Stimme hinzu – das Overlay zeigt sie sofort.</li>
            <li>Erscheint das Overlay abgeblendet, hat es gerade keine Verbindung zu Audience Live. Es verbindet sich von selbst wieder.</li>
          </ol>
        )}
      </TabPanel>
    </div>
  );
}
