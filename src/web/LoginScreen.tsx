import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { BrandLogo } from '../components/brand/BrandLogo';
import { Icon } from './Icon';
import { login } from './webAuth';

type LoginScreenProps = {
  /** Shown after the server rejected a session that was signed in before. */
  sessionExpired?: boolean;
  onSignedIn: () => void;
};

type Problem =
  | { kind: 'empty' }
  | { kind: 'invalid-password' }
  | { kind: 'unavailable' }
  | { kind: 'locked'; until: number };

const PROBLEM_MESSAGES: Record<Problem['kind'], string> = {
  empty: 'Bitte gib dein Passwort ein.',
  'invalid-password': 'Das Passwort stimmt nicht. Bitte versuche es erneut.',
  unavailable: 'Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.',
  locked: 'Zu viele Fehlversuche. Aus Sicherheitsgründen ist die Anmeldung kurz gesperrt.'
};

/** Remaining lockout as `m:ss`. */
export function formatWait(milliseconds: number): string {
  const total = Math.max(1, Math.ceil(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function LoginScreen({ sessionExpired = false, onSignedIn }: LoginScreenProps): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [shaking, setShaking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const lockedUntil = problem?.kind === 'locked' ? problem.until : null;
  const locked = lockedUntil !== null && lockedUntil > now;

  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setProblem(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  useEffect(() => {
    if (!locked) inputRef.current?.focus();
  }, [locked]);

  const detectCapsLock = (event: KeyboardEvent<HTMLInputElement>): void => {
    setCapsLock(event.getModifierState('CapsLock'));
  };

  const reject = (next: Problem): void => {
    setProblem(next);
    setShaking(next.kind !== 'unavailable');
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || locked) return;
    if (!password) {
      reject({ kind: 'empty' });
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setProblem(null);
    const result = await login(password);
    setSubmitting(false);

    switch (result.status) {
      case 'signed-in':
        onSignedIn();
        return;
      case 'invalid-password':
        setPassword('');
        reject({ kind: 'invalid-password' });
        inputRef.current?.focus();
        return;
      case 'locked': {
        const current = Date.now();
        setPassword('');
        setNow(current);
        reject({ kind: 'locked', until: current + result.retryAfterSeconds * 1000 });
        return;
      }
      case 'unavailable':
        reject({ kind: 'unavailable' });
    }
  };

  const message = problem ? PROBLEM_MESSAGES[problem.kind] : null;

  let submitLabel: ReactNode = 'Anmelden';
  if (submitting) {
    submitLabel = (
      <>
        <span className="spinner" aria-hidden="true" />
        Wird geprüft …
      </>
    );
  } else if (locked) {
    submitLabel = (
      <>
        <Icon>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </Icon>
        Erneut möglich in {formatWait(lockedUntil - now)}
      </>
    );
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <header className="login-brand">
          <span className="login-mark" aria-hidden="true">
            <BrandLogo size="lg" />
          </span>
          <h1 id="login-title">Audience Live</h1>
          <p>Melde dich an, um Livestream, Stimmen und Overlay zu steuern.</p>
        </header>

        {sessionExpired && !problem && (
          <p className="login-notice" role="status">
            Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.
          </p>
        )}

        <form onSubmit={(event) => void submit(event)} noValidate>
          {/* Lets password managers store the password under a recognizable name. */}
          <input
            className="visually-hidden"
            type="text"
            name="username"
            autoComplete="username"
            value="Audience Live"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />

          <label htmlFor="login-password">Passwort</label>
          <div className={shaking ? 'password-field shake' : 'password-field'} onAnimationEnd={() => setShaking(false)}>
            <input
              ref={inputRef}
              id="login-password"
              name="password"
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (problem && problem.kind !== 'locked') setProblem(null);
              }}
              onKeyDown={detectCapsLock}
              onKeyUp={detectCapsLock}
              placeholder="Dashboard-Passwort"
              autoComplete="current-password"
              spellCheck={false}
              readOnly={submitting}
              disabled={locked}
              aria-invalid={problem?.kind === 'empty' || problem?.kind === 'invalid-password' ? true : undefined}
              aria-describedby={message ? 'login-error' : undefined}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label="Passwort anzeigen"
              aria-pressed={visible}
              disabled={locked}
              onClick={() => {
                setVisible((current) => !current);
                inputRef.current?.focus();
              }}
            >
              {visible ? (
                <Icon>
                  <path d="m3 3 18 18" />
                  <path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
                  <path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </Icon>
              ) : (
                <Icon>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </Icon>
              )}
            </button>
          </div>

          {capsLock && !locked && <p className="login-hint">Die Feststelltaste ist aktiv.</p>}

          {message && (
            <p id="login-error" className="login-error" role="alert">
              <Icon>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.5" />
                <path d="M12 16.5h.01" />
              </Icon>
              <span>{message}</span>
            </p>
          )}

          <button type="submit" className="button primary login-submit" disabled={locked} aria-busy={submitting}>
            {submitLabel}
          </button>
        </form>

        <p className="login-footer">
          Das OBS-Overlay unter <code>/overlay</code> funktioniert ohne Anmeldung.
        </p>
      </section>
    </main>
  );
}
