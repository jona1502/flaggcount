// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchSession = vi.fn(async () => true);
vi.mock('./webAuth', () => ({ fetchSession, login: vi.fn(), logout: vi.fn(async () => undefined) }));
vi.mock('./webApi', () => ({ webApi: { copyText: vi.fn() }, onUnauthorized: () => () => undefined }));
vi.mock('../api/useFlagCount', () => ({
  useFlagCount: () => ({ state: null, error: null, pending: false, actions: {}, dismissError: () => undefined })
}));
vi.mock('../dashboard/Dashboard', () => ({ Dashboard: () => <p>Dashboard geladen</p> }));
vi.mock('./LoginScreen', () => ({ LoginScreen: () => <p>Anmeldung</p> }));

const { WebApp } = await import('./WebApp');

afterEach(() => {
  cleanup();
  fetchSession.mockClear();
});

describe('WebApp', () => {
  it('asks the server for the session without a known status', async () => {
    render(<WebApp />);

    expect(await screen.findByText('Dashboard geladen')).toBeTruthy();
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it('uses the session status the server already checked', () => {
    render(<WebApp initialAuth="signed-in" />);
    expect(screen.getByText('Dashboard geladen')).toBeTruthy();
    cleanup();

    render(<WebApp initialAuth="signed-out" />);
    expect(screen.getByText('Anmeldung')).toBeTruthy();
    expect(fetchSession).not.toHaveBeenCalled();
  });
});
