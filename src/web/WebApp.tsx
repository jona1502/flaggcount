import { useEffect, useState } from 'react';
import { useFlagCount } from '../api/useFlagCount';
import { Dashboard } from '../dashboard/Dashboard';
import { LoginScreen } from './LoginScreen';
import { onUnauthorized, webApi } from './webApi';
import { fetchSession, logout } from './webAuth';

type AuthState = 'checking' | 'signed-out' | 'expired' | 'signed-in';

/**
 * Dashboard of the web version: same UI as the desktop app, behind a login, talking to the web server.
 * `initialAuth` is the session status the server already checked; without it the browser asks first.
 */
export function WebApp({ initialAuth }: { initialAuth?: 'signed-in' | 'signed-out' } = {}): React.JSX.Element {
  const [auth, setAuth] = useState<AuthState>(initialAuth ?? 'checking');

  useEffect(() => {
    let active = true;
    const check = initialAuth ? Promise.resolve(initialAuth === 'signed-in') : fetchSession();
    check.then(
      (signedIn) => {
        if (active) setAuth(signedIn ? 'signed-in' : 'signed-out');
      },
      () => {
        if (active) setAuth('signed-out');
      }
    );
    const stopListening = onUnauthorized(() => setAuth((current) => (current === 'signed-in' ? 'expired' : current)));
    return () => {
      active = false;
      stopListening();
    };
  }, [initialAuth]);

  if (auth === 'checking') {
    return <div className="login-page" aria-busy="true" />;
  }
  if (auth !== 'signed-in') {
    return <LoginScreen sessionExpired={auth === 'expired'} onSignedIn={() => setAuth('signed-in')} />;
  }

  const signOut = (): void => {
    void logout()
      .catch(() => undefined)
      .finally(() => setAuth('signed-out'));
  };
  return <SignedInDashboard onLogout={signOut} />;
}

/** Mounted only after login, so the API calls and the live stream never run without a session. */
function SignedInDashboard({ onLogout }: { onLogout: () => void }): React.JSX.Element {
  const flagCount = useFlagCount(webApi);

  return (
    <Dashboard
      state={flagCount.state}
      error={flagCount.error}
      pending={flagCount.pending}
      actions={flagCount.actions}
      onDismissError={flagCount.dismissError}
      onCopyText={webApi.copyText}
      onLogout={onLogout}
    />
  );
}
