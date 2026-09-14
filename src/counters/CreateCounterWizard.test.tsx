// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES, FREE_ENTITLEMENTS, PRO_ENTITLEMENTS, entitlementsFor } from '../../shared/entitlements';
import { createRedFlagCounter, type CounterDefinition } from '../../shared/profiles';
import { CreateCounterWizard } from './CreateCounterWizard';

afterEach(cleanup);

function renderWizard(overrides: Partial<ComponentProps<typeof CreateCounterWizard>> = {}) {
  const props: ComponentProps<typeof CreateCounterWizard> = {
    existing: [createRedFlagCounter(100)],
    entitlements: PRO_ENTITLEMENTS,
    busy: false,
    error: null,
    onCancel: vi.fn(),
    onCreate: vi.fn<(counter: CounterDefinition) => void>(),
    onShowLicense: vi.fn(),
    ...overrides
  };
  const view = render(<CreateCounterWizard {...props} />);
  return { props, view, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const next = (user: User) => user.click(button('Weiter'));
const stepTitle = () => screen.getByRole('heading', { level: 3 }).textContent;

async function addTrigger(user: User, title: string, value: string, kind: 'emoji' | 'text' = 'emoji') {
  if (kind === 'text') await user.selectOptions(screen.getByLabelText(`Art des neuen Auslösers (${title})`), 'text');
  await user.type(screen.getByLabelText(`Neuer Auslöser (${title})`), value);
  await user.click(button(`Auslöser hinzufügen (${title})`));
}

describe('CreateCounterWizard', () => {
  it('creates an A/B poll on Pro in six understandable steps', async () => {
    const { props, user } = renderWizard();
    const dialog = screen.getByRole('dialog', { name: 'Neues Element' });

    expect((within(dialog).getByRole('radio', { name: 'Abstimmung' }) as HTMLInputElement).checked).toBe(true);
    expect(stepTitle()).toBe('Schritt 1 von 6: Typ');
    await next(user);

    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Welches Team?');
    await next(user);

    expect(stepTitle()).toBe('Schritt 3 von 6: Optionen');
    await user.clear(screen.getByLabelText('Bezeichnung von Option 1'));
    await user.type(screen.getByLabelText('Bezeichnung von Option 1'), 'Rot');
    await user.clear(screen.getByLabelText('Bezeichnung von Option 2'));
    await user.type(screen.getByLabelText('Bezeichnung von Option 2'), 'Blau');
    await next(user);

    expect(stepTitle()).toBe('Schritt 4 von 6: Auslöser');
    await addTrigger(user, 'Stimme für Rot', '🔴');
    await addTrigger(user, 'Stimme für Blau', '🔵');
    await next(user);

    expect(stepTitle()).toBe('Schritt 5 von 6: Rücknahme');
    await addTrigger(user, 'Stimme zurücknehmen', 'weg', 'text');
    await next(user);

    expect(stepTitle()).toBe('Schritt 6 von 6: Zusammenfassung');
    expect(screen.getByText('Welches Team?')).toBeTruthy();
    await user.click(button('Erstellen'));

    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Welches Team?',
        mode: 'poll',
        target: null,
        options: [
          expect.objectContaining({ label: 'Rot', triggers: [{ kind: 'text', value: 'A', match: 'word' }, { kind: 'emoji', value: '🔴', match: 'contains' }] }),
          expect.objectContaining({ label: 'Blau', triggers: [{ kind: 'text', value: 'B', match: 'word' }, { kind: 'emoji', value: '🔵', match: 'contains' }] })
        ],
        withdrawalTriggers: [{ kind: 'text', value: 'weg', match: 'word' }]
      })
    );
  });

  it('keeps polls visible on Free, explains the plan and blocks continuing at the limit', async () => {
    const { props, user } = renderWizard({ entitlements: FREE_ENTITLEMENTS });

    const poll = screen.getByRole('radio', { name: 'Abstimmung' }) as HTMLInputElement;
    expect(poll.disabled).toBe(true);
    expect(screen.getByText('Pro erforderlich')).toBeTruthy();
    expect(poll.getAttribute('aria-describedby')).toBe('wizard-type-poll-description');
    expect(screen.getByRole('note', { name: 'Höchstens 1 Element gleichzeitig' })).toBeTruthy();
    expect(button('Weiter').disabled).toBe(true);

    await user.click(button('Pro ansehen'));
    expect(props.onShowLicense).toHaveBeenCalled();
  });

  it('explains a Pro license without the poll feature instead of offering an upgrade', () => {
    renderWizard({ entitlements: entitlementsFor('pro', FEATURES.filter((feature) => feature !== 'multi-option-polls')) });

    expect((screen.getByRole('radio', { name: 'Abstimmung' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'Einfacher Zähler' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Nicht freigegeben')).toBeTruthy();
    expect(screen.queryByText('Pro erforderlich')).toBeNull();
    expect(button('Weiter').disabled).toBe(false);
  });

  it('blocks ambiguous triggers until they are fixed', async () => {
    const { user } = renderWizard();
    await next(user);
    await next(user);
    await next(user);

    await addTrigger(user, 'Stimme für B', 'a', 'text');
    expect(screen.getAllByText(/„A“ gehört zu mehreren Stellen \(Option „A“, Option „B“\)/)).toHaveLength(2);
    expect(button('Weiter').disabled).toBe(true);

    await user.click(button('Auslöser a entfernen (Stimme für B)'));
    expect(button('Weiter').disabled).toBe(false);
  });

  it('validates name and target before continuing', async () => {
    const { user } = renderWizard();
    await next(user);

    await user.clear(screen.getByLabelText('Name'));
    expect(screen.getByText('Der Name braucht 1 bis 60 Zeichen.')).toBeTruthy();
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
    expect(button('Weiter').disabled).toBe(true);

    await user.type(screen.getByLabelText('Name'), 'Quiz');
    await user.click(screen.getByRole('switch', { name: 'Stimmenziel festlegen' }));
    await user.clear(screen.getByLabelText('Stimmenziel'));
    await user.type(screen.getByLabelText('Stimmenziel'), '0');
    expect(screen.getByText('Das Stimmenziel muss eine ganze Zahl zwischen 1 und 100.000 sein.')).toBeTruthy();
    expect(button('Weiter').disabled).toBe(true);
  });

  it('creates a single counter and rejects emoji triggers that contain letters', async () => {
    const { props, user } = renderWizard();
    await user.click(screen.getByRole('radio', { name: 'Einfacher Zähler' }));
    expect(stepTitle()).toBe('Schritt 1 von 5: Typ');
    await next(user);
    await next(user);

    await addTrigger(user, 'Stimme für Zähler 2', 'ja');
    expect(screen.getByText('Ein Emoji-Auslöser darf nur Emojis ohne Leerzeichen enthalten.')).toBeTruthy();

    await next(user);
    await next(user);
    await user.click(button('Erstellen'));
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'single', name: 'Zähler 2', options: [expect.objectContaining({ triggers: [{ kind: 'emoji', value: '🔥', match: 'contains' }] })] })
    );
  });

  it('adds options up to six and removes them down to two', async () => {
    const { user } = renderWizard();
    await next(user);
    await next(user);

    for (let count = 3; count <= 6; count++) {
      await user.click(button('Option zu Abstimmung 2 hinzufügen'));
      expect(screen.getByLabelText(`Bezeichnung von Option ${count}`)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Option zu Abstimmung 2 hinzufügen' })).toBeNull();
    expect(screen.getByText('6 von 6 Optionen')).toBeTruthy();

    for (const letter of ['F', 'E', 'D', 'C']) {
      await user.click(button(`${letter} entfernen`));
    }
    expect(screen.queryByRole('button', { name: /entfernen$/ })).toBeNull();
  });

  it('shows why the backend refused to create the element', async () => {
    const { props, view, user } = renderWizard();
    for (let step = 0; step < 5; step++) await next(user);
    await user.click(button('Erstellen'));

    view.rerender(<CreateCounterWizard {...props} error={{ code: 'pro-required', message: 'Polls require FlagCount Pro' }} />);

    expect(screen.getByRole('alert', { name: 'Das Element wurde nicht erstellt' })).toBeTruthy();
  });
});
