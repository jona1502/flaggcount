// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES } from '../../shared/entitlements';
import { FREE_LICENSE_STATE, type LicenseState } from '../../shared/licensing';
import { createRedFlagCounter, type CounterDefinition } from '../../shared/profiles';
import { CounterEditor } from './CounterEditor';

afterEach(cleanup);

const PRO: LicenseState = { ...FREE_LICENSE_STATE, plan: 'pro', status: 'active', features: [...FEATURES] };

function renderEditor(overrides: Partial<ComponentProps<typeof CounterEditor>> = {}) {
  const onSave = vi.fn<(counters: CounterDefinition[]) => void>();
  const props: ComponentProps<typeof CounterEditor> = {
    counters: [createRedFlagCounter(100)],
    license: FREE_LICENSE_STATE,
    disabled: false,
    readOnly: false,
    onSave,
    onShowPro: vi.fn(),
    ...overrides
  };
  render(<CounterEditor {...props} />);
  return { props, onSave, user: userEvent.setup() };
}

const saveButton = () => screen.getByRole('button', { name: 'Zähler speichern' }) as HTMLButtonElement;

describe('CounterEditor', () => {
  it('lets Free rename the red flag counter but keeps Pro options visible and locked', async () => {
    const { onSave, props, user } = renderEditor();

    expect((screen.getByRole('option', { name: 'Abstimmung mit Optionen (Pro)' }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Auslöser hinzufügen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abstimmung hinzufügen' })).toBeNull();
    expect(saveButton().disabled).toBe(true);

    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Flaggen-Runde');
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ name: 'Flaggen-Runde', mode: 'single' })]);
    await user.click(screen.getByRole('button', { name: 'Mehr zu Pro' }));
    expect(props.onShowPro).toHaveBeenCalled();
  });

  it('builds a poll with custom triggers on Pro and blocks ambiguous triggers', async () => {
    const { onSave, user } = renderEditor({ license: PRO });

    await user.click(screen.getByRole('button', { name: 'Abstimmung hinzufügen' }));
    const poll = screen.getByRole('group', { name: 'Abstimmung 2' });
    expect(within(poll).getByDisplayValue('A')).toBeTruthy();

    await user.selectOptions(within(poll).getByLabelText('Art des neuen Auslösers (Stimme für B)'), 'text');
    await user.type(within(poll).getByLabelText('Neuer Auslöser (Stimme für B)'), 'a');
    await user.click(within(poll).getByRole('button', { name: 'Auslöser hinzufügen (Stimme für B)' }));

    expect(within(poll).getByText(/„A“ gehört zu mehreren Stellen \(Option „A“, Option „B“\)/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    await user.click(within(poll).getByRole('button', { name: 'Auslöser a entfernen (Stimme für B)' }));
    await user.type(within(poll).getByLabelText('Neuer Auslöser (Stimme für B)'), 'nein');
    await user.click(within(poll).getByRole('button', { name: 'Auslöser hinzufügen (Stimme für B)' }));
    await user.click(saveButton());

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved).toHaveLength(2);
    expect(saved?.[1]?.options[1]?.triggers).toEqual([
      { kind: 'text', value: 'B', match: 'word' },
      { kind: 'text', value: 'nein', match: 'word' }
    ]);
  });

  it('rejects emoji triggers that contain letters', async () => {
    const { user } = renderEditor({ license: PRO });

    await user.type(screen.getByLabelText('Neuer Auslöser (Stimme für Rote Flaggen)'), 'ja');
    await user.click(screen.getByRole('button', { name: 'Auslöser hinzufügen (Stimme für Rote Flaggen)' }));

    expect(screen.getByText('Ein Emoji-Auslöser darf nur Emojis ohne Leerzeichen enthalten.')).toBeTruthy();
  });

  it('adds and removes poll options within the limits and discards changes', async () => {
    const { user } = renderEditor({ license: PRO });

    await user.selectOptions(screen.getByLabelText('Art'), 'poll');
    expect(screen.getByLabelText('Bezeichnung von Option 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Rote Flagge entfernen/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Option zu Rote Flaggen hinzufügen' }));
    expect(screen.getByLabelText('Bezeichnung von Option 3')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Änderungen verwerfen' }));
    expect(screen.queryByLabelText('Bezeichnung von Option 2')).toBeNull();
    expect(saveButton().disabled).toBe(true);
  });

  it('shows an inactive profile without letting it change', () => {
    renderEditor({ readOnly: true, counters: [createRedFlagCounter(5)] });

    expect(screen.getByText(/nur mit FlagCount Pro nutzbar/)).toBeTruthy();
    expect((screen.getByLabelText('Name').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });
});
