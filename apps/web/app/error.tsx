'use client';

/** Shown when rendering a page failed; details stay in the server log. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="landing">
      <section className="landing-inner landing-section narrow-section" aria-labelledby="error-title">
        <p className="eyebrow">Fehler</p>
        <h1 id="error-title">Da ist etwas schiefgelaufen</h1>
        <p className="lead">Die Seite konnte gerade nicht geladen werden. Bitte versuche es erneut.</p>
        <button className="button primary" type="button" onClick={reset}>
          Erneut versuchen
        </button>
      </section>
    </main>
  );
}
