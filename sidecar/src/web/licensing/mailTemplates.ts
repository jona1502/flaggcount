export type MailContent = {
  subject: string;
  text: string;
};

// Plain text only: no tracking pixels, no links that could be mistaken for phishing, no legal claims.
// The wording is a draft and must be reviewed together with the terms before the public launch.

function instructions(code: string): string {
  return [
    'So aktivierst du FlagCount Pro:',
    '',
    '1. Öffne FlagCount auf deinem Windows-PC.',
    '2. Wechsle in den Bereich „Pro“.',
    '3. Gib diesen Aktivierungscode ein und klicke auf „Aktivieren“:',
    '',
    `   ${code}`,
    '',
    'Der Code funktioniert auf bis zu drei Computern gleichzeitig. Gib ihn nicht weiter.'
  ].join('\n');
}

function footer(reference: string, supportEmail: string): string {
  return [
    '',
    `Lizenzreferenz für den Support: ${reference}`,
    `Fragen? Schreib an ${supportEmail}.`,
    '',
    'FlagCount ist kein offizielles Produkt von TikTok.'
  ].join('\n');
}

export function activationMail(code: string, reference: string, supportEmail: string): MailContent {
  return {
    subject: 'Dein Aktivierungscode für FlagCount Pro',
    text: ['Danke für deinen Kauf von FlagCount Pro!', '', instructions(code), footer(reference, supportEmail)].join('\n')
  };
}

export function recoveryMail(code: string, reference: string, supportEmail: string): MailContent {
  return {
    subject: 'Neuer Aktivierungscode für FlagCount Pro',
    text: [
      'Du hast einen neuen Aktivierungscode für FlagCount Pro angefordert. Frühere Codes sind damit ungültig;',
      'bereits aktivierte Computer bleiben aktiv.',
      '',
      'Falls du das nicht warst, kannst du diese E-Mail ignorieren.',
      '',
      instructions(code),
      footer(reference, supportEmail)
    ].join('\n')
  };
}
