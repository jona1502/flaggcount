import { PRO_LIMITS, canUse, limitFor, type Entitlements, type LimitName } from '../../shared/entitlements';
import { Badge } from '../components/ui';
import { PRO_FEATURES } from '../pro/proFeatures';

const numberFormat = new Intl.NumberFormat('de-DE');

/** Every Pro feature with its state under the current license. */
export function FeatureMatrix({ entitlements }: { entitlements: Entitlements }): React.JSX.Element {
  const isPro = entitlements.plan === 'pro';
  return (
    <ul className="feature-matrix" aria-label="Pro-Funktionen">
      {PRO_FEATURES.map((description) => {
        const active = canUse(entitlements, description.feature);
        return (
          <li key={description.feature} data-active={active}>
            <div className="feature-matrix-text">
              <strong>{description.title}</strong>
              <span>{description.benefit}</span>
            </div>
            {isPro ? (
              <Badge tone={active ? 'success' : 'warning'}>{active ? 'aktiv' : 'nicht freigegeben'}</Badge>
            ) : (
              <Badge tone="pro" srLabel="Mit FlagCount Pro">
                Pro
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const LIMITS: { limit: LimitName; label: string; format?: (value: number) => string }[] = [
  { limit: 'profiles', label: 'Gespeicherte Profile' },
  { limit: 'counters', label: 'Zähler & Abstimmungen gleichzeitig' },
  { limit: 'pollOptions', label: 'Optionen pro Abstimmung', format: (value) => (value <= 1 ? 'keine Abstimmungen' : `bis ${value}`) },
  { limit: 'optionTriggers', label: 'Auslöser pro Option', format: (value) => (value <= 1 ? 'nur 🚩' : `bis ${value}`) },
  { limit: 'withdrawalTriggers', label: 'Rücknahme-Auslöser', format: (value) => (value <= 1 ? 'nur 🏳️' : `bis ${value}`) },
  { limit: 'overlayUrls', label: 'Overlays mit lokaler und Online-URL' },
  { limit: 'historyRecords', label: 'Gespeicherte Runden', format: (value) => (value === 0 ? 'keine' : numberFormat.format(value)) }
];

/** The effective limits of the plan, compared with Pro while Free is active. */
export function LimitsTable({ entitlements }: { entitlements: Entitlements }): React.JSX.Element {
  const isPro = entitlements.plan === 'pro';
  return (
    <div className="table-scroll">
      <table className="limits-table">
        <caption className="visually-hidden">Grenzen deines Tarifs</caption>
        <thead>
          <tr>
            <th scope="col">Fähigkeit</th>
            <th scope="col">Dein Tarif</th>
            {!isPro && <th scope="col">Mit Pro</th>}
          </tr>
        </thead>
        <tbody>
          {LIMITS.map(({ limit, label, format = (value) => numberFormat.format(value) }) => (
            <tr key={limit}>
              <th scope="row">{label}</th>
              <td>{format(limitFor(entitlements, limit))}</td>
              {!isPro && <td>{format(PRO_LIMITS[limit])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
