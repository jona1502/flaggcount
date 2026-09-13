import type { Feature } from '../../shared/entitlements';

export type ProFeatureDescription = {
  feature: Feature;
  title: string;
  benefit: string;
};

/** What each Pro feature does for the streamer, in the order of the plan comparison. */
export const PRO_FEATURES: readonly ProFeatureDescription[] = [
  {
    feature: 'custom-triggers',
    title: 'Eigene Emojis und Begriffe',
    benefit: 'Lass mit beliebigen Emojis oder Wörtern abstimmen, nicht nur mit roten Flaggen.'
  },
  {
    feature: 'multi-option-polls',
    title: 'Abstimmungen mit bis zu sechs Optionen',
    benefit: 'A/B/C-Fragen oder Team-Wahlen – jede Person zählt pro Runde einmal und kann umentscheiden.'
  },
  {
    feature: 'parallel-counters',
    title: 'Bis zu vier Zähler gleichzeitig',
    benefit: 'Mehrere Abstimmungen parallel, jede mit eigenem Overlay.'
  },
  {
    feature: 'multiple-profiles',
    title: 'Bis zu zehn Stream-Profile',
    benefit: 'Speichere Einstellungen für verschiedene Formate und wechsle zwischen ihnen.'
  },
  {
    feature: 'history',
    title: 'Verlauf und Statistiken',
    benefit: 'Die letzten 500 Runden als anonyme Ergebnisse, gespeichert nur auf deinem PC.'
  },
  { feature: 'csv-export', title: 'CSV-Export', benefit: 'Ergebnisse direkt in Excel öffnen.' },
  {
    feature: 'premium-templates',
    title: 'Premium-Overlays',
    benefit: 'Zusätzliche Vorlagen und Animationen für dein Stream-Layout.'
  },
  {
    feature: 'custom-branding',
    title: 'Logo, Schriften und Hintergründe',
    benefit: 'Das Overlay in deinem eigenen Look.'
  },
  {
    feature: 'priority-support',
    title: 'Priorisierter Support',
    benefit: 'Schnellere Hilfe mit deiner Lizenzreferenz.'
  }
];

export function describeFeature(feature: Feature): ProFeatureDescription {
  return PRO_FEATURES.find((description) => description.feature === feature) ?? { feature, title: feature, benefit: '' };
}
