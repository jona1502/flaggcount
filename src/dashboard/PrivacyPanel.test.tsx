// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PrivacyPanel } from './PrivacyPanel';

describe('PrivacyPanel', () => {
  it('explains the opt-in and changes it explicitly', async () => {
    const onChange = vi.fn();
    render(<PrivacyPanel enabled={false} disabled={false} onChange={onChange} />);

    expect(screen.getByText(/Benutzernamen, Zuschauer, Chattexte/)).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Anonyme Nutzungsdaten senden' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
