import { describe, expect, it } from 'vitest';
import { activationMail, recoveryMail, supportMail } from './mailTemplates';

describe('Audience Live license mail branding', () => {
  it.each([
    ['activation', activationMail],
    ['recovery', recoveryMail],
    ['support', supportMail]
  ])('uses the current product name in the %s mail', (_kind, render) => {
    const mail = render('FC-ABCDE-FGHIJ-KLMNO-PQRST', 'license-reference', 'support@example.com');
    const content = `${mail.subject}\n${mail.text}`;

    expect(content).toContain('Audience Live Pro');
    expect(content).not.toContain('FlagCount');
  });
});
