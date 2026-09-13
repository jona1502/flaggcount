// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen, formatWait } from './LoginScreen';
import { login } from './webAuth';

vi.mock('./webAuth', () => ({ login: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(login).mockReset();
});

function renderLogin(sessionExpired = false) {
  const onSignedIn = vi.fn();
  const user = userEvent.setup();
  render(<LoginScreen sessionExpired={sessionExpired} onSignedIn={onSignedIn} />);
  const input = screen.getByLabelText('Passwort') as HTMLInputElement;
  return { user, onSignedIn, input };
}

const submitButton = (name: string | RegExp = 'Anmelden') =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

describe('LoginScreen', () => {
  it('signs in with the entered password', async () => {
    vi.mocked(login).mockResolvedValue({ status: 'signed-in' });
    const { user, onSignedIn, input } = renderLogin();

    await user.type(input, 'secret-password');
    await user.click(submitButton());

    expect(login).toHaveBeenCalledWith('secret-password');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('asks for a password before contacting the server', async () => {
    const { user } = renderLogin();

    await user.click(submitButton());

    expect((await screen.findByRole('alert')).textContent).toContain('Bitte gib dein Passwort ein.');
    expect(login).not.toHaveBeenCalled();
  });

  it('reports a wrong password and clears the field', async () => {
    vi.mocked(login).mockResolvedValue({ status: 'invalid-password' });
    const { user, onSignedIn, input } = renderLogin();

    await user.type(input, 'wrong{Enter}');

    expect((await screen.findByRole('alert')).textContent).toContain('Das Passwort stimmt nicht.');
    expect(input.value).toBe('');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('locks the form while the server refuses further attempts', async () => {
    vi.mocked(login).mockResolvedValue({ status: 'locked', retryAfterSeconds: 900 });
    const { user, input } = renderLogin();

    await user.type(input, 'wrong{Enter}');

    expect((await screen.findByRole('alert')).textContent).toContain('Zu viele Fehlversuche.');
    expect(submitButton(/Erneut möglich in 15:00/).disabled).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it('reveals the password on request', async () => {
    const { user, input } = renderLogin();

    await user.click(screen.getByRole('button', { name: 'Passwort anzeigen' }));

    expect(input.type).toBe('text');
  });

  it('explains why a signed-in user sees the login again', () => {
    renderLogin(true);

    expect(screen.getByRole('status').textContent).toContain('Deine Sitzung ist abgelaufen.');
  });
});

describe('formatWait', () => {
  it('rounds up to whole seconds', () => {
    expect(formatWait(900_000)).toBe('15:00');
    expect(formatWait(61_200)).toBe('1:02');
    expect(formatWait(0)).toBe('0:01');
  });
});
