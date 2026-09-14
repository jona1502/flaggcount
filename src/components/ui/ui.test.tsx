// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  IconCopy,
  Input,
  Skeleton,
  Switch,
  TabPanel,
  Tabs,
  ToastProvider,
  Tooltip,
  useToast
} from './index';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Button', () => {
  it('blocks repeated clicks while loading and exposes the busy state', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Speichern</Button>);
    const button = screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement;

    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} loading>
        Speichern
      </Button>
    );
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('gives icon-only buttons an accessible name', () => {
    render(<IconButton label="URL kopieren" icon={IconCopy} />);

    const button = screen.getByRole('button', { name: 'URL kopieren' });
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('can be reached and pressed with the keyboard', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Verbinden</Button>);
    const user = userEvent.setup();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Verbinden' }));
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

function DialogHarness({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <Dialog
        open={open}
        title="Neues Element"
        description="Wähle den Typ."
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        footer={<button type="button">Weiter</button>}
      >
        <input aria-label="Name" data-autofocus />
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('moves focus inside, traps Tab and restores focus on Escape', async () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const user = userEvent.setup();
    const opener = screen.getByRole('button', { name: 'Öffnen' });

    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Neues Element' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Weiter' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dialog schließen' }));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Weiter' }));

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('starts confirmations on the safe choice', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Runde zurücksetzen?"
        message="Alle Stimmen werden gelöscht."
        confirmLabel="Ja, zurücksetzen"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abbrechen' }));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('connects label, hint and error to the control', () => {
    render(
      <Field id="username" label="TikTok-Benutzername" hint="Ohne @ möglich" error="Bitte gib einen Namen ein.">
        <Input />
      </Field>
    );

    const input = screen.getByLabelText('TikTok-Benutzername');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('username-error username-hint');
    expect(screen.getByText('Bitte gib einen Namen ein.').id).toBe('username-error');
  });
});

describe('Switch', () => {
  it('toggles with mouse and keyboard and reports its state', async () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      return <Switch checked={checked} onChange={setChecked} label="Hintergrund anzeigen" />;
    }
    render(<Harness />);
    const user = userEvent.setup();
    const control = screen.getByRole('switch', { name: 'Hintergrund anzeigen' });

    await user.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
    await user.keyboard(' ');
    expect(control.getAttribute('aria-checked')).toBe('false');
  });
});

describe('Tabs', () => {
  it('moves selection with arrow keys, Home and End', async () => {
    function Harness() {
      const [value, setValue] = useState<'obs' | 'studio' | 'test'>('obs');
      return (
        <>
          <Tabs
            label="Einrichtung"
            idPrefix="setup"
            value={value}
            onChange={setValue}
            items={[
              { id: 'obs', label: 'OBS' },
              { id: 'studio', label: 'LIVE Studio' },
              { id: 'test', label: 'Testen' }
            ]}
          />
          <TabPanel idPrefix="setup" id={value}>
            Inhalt {value}
          </TabPanel>
        </>
      );
    }
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'OBS' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'LIVE Studio', selected: true }));
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Testen' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'OBS' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'OBS' }).textContent).toBe('Inhalt obs');
  });
});

describe('Toast', () => {
  it('announces confirmations in a live region and hides them after a while', () => {
    vi.useFakeTimers();
    function Trigger() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast({ title: 'URL kopiert', description: 'In OBS einfügen.' })}>
          Kopieren
        </button>
      );
    }
    render(
      <ToastProvider durationMs={3000}>
        <Trigger />
      </ToastProvider>
    );

    const region = screen.getByRole('region', { name: 'Benachrichtigungen' });
    expect(region.querySelector('[aria-live="polite"]')).toBeTruthy();

    act(() => screen.getByRole('button', { name: 'Kopieren' }).click());
    expect(region.textContent).toContain('URL kopiert');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(region.textContent).not.toContain('URL kopiert');
  });
});

describe('Content primitives', () => {
  it('names callouts by their title and offers their action', async () => {
    const onRefresh = vi.fn();
    render(
      <Callout
        tone="warning"
        title="Pro-Funktionen fehlen"
        actions={
          <Button onClick={onRefresh} variant="secondary">
            Lizenzstatus aktualisieren
          </Button>
        }
      >
        Abstimmungen sind nicht freigegeben.
      </Callout>
    );

    const note = screen.getByRole('note', { name: 'Pro-Funktionen fehlen' });
    expect(note.textContent).toContain('Abstimmungen sind nicht freigegeben.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lizenzstatus aktualisieren' }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('describes a control with a tooltip on focus', async () => {
    render(
      <Tooltip content="Kopiert die lokale Adresse">
        <button type="button">Kopieren</button>
      </Tooltip>
    );
    const button = screen.getByRole('button', { name: 'Kopieren' });

    await userEvent.setup().tab();
    expect(document.activeElement).toBe(button);
    const tooltip = screen.getByRole('tooltip');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(tooltip.getAttribute('data-visible')).toBe('true');
  });

  it('renders empty states, badges with screen reader text and hidden skeletons', () => {
    render(
      <>
        <EmptyState title="Noch keine Abstimmung" description="Lege dein erstes Element an." action={<Button>Neues Element</Button>} />
        <Badge tone="pro" srLabel="Pro erforderlich">
          Pro
        </Badge>
        <Skeleton />
      </>
    );

    expect(screen.getByRole('heading', { name: 'Noch keine Abstimmung' })).toBeTruthy();
    expect(screen.getByText('Pro erforderlich')).toBeTruthy();
    expect(document.querySelector('.ui-skeleton')?.getAttribute('aria-hidden')).toBe('true');
  });
});
