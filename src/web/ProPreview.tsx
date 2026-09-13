import { useState } from 'react';

const FEATURES = [
  ['Abstimmungen', 'Rote und weiße Flaggen', '2–6 Optionen, eigene Emojis und Begriffe'],
  ['Gleichzeitig aktiv', '1 Zähler', 'Bis zu 4 Zähler'],
  ['Stream-Profile', '1 Profil', 'Bis zu 10 Profile'],
  ['Overlays', 'Standard, lokal und online', 'Premium-Vorlagen und je Zähler eine URL'],
  ['Auswertung', 'Aktuelle Runde', 'Lokale Historie und CSV-Export'],
  ['Design', 'Farben, Position, Größe und Effekte', 'Logo, Schriften und eigener Hintergrund']
] as const;

type FormStatus = { kind: 'success' | 'error'; message: string } | null;
type Price = { plan: 'monthly' | 'yearly'; total: string; currencyCode: string; interval: string };

export function ProPreview(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<FormStatus>(null);
  const prices: Price[] = [];
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  const checkout = async (plan: 'monthly' | 'yearly'): Promise<void> => {
    setCheckoutPlan(plan);
    try {
      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan })
      });
      const data = (await response.json()) as { url?: string };
      if (!response.ok || !data.url?.startsWith('https://')) throw new Error('unavailable');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      setStatus({ kind: 'error', message: 'Checkout ist momentan nicht verfügbar. Bitte versuche es später erneut.' });
    } finally {
      setCheckoutPlan(null);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const unsubscribe = submitter?.value === 'unsubscribe';
    if (!unsubscribe && !consent) {
      setStatus({ kind: 'error', message: 'Bitte bestätige zuerst die Einwilligung.' });
      return;
    }

    setPending(true);
    setStatus(null);
    try {
      const response = await fetch(unsubscribe ? '/api/v1/waitlist/unsubscribe' : '/api/v1/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unsubscribe ? { email } : { email, consent: true })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setConsent(false);
      setStatus({
        kind: 'success',
        message: unsubscribe
          ? 'Die Adresse wurde aus der Warteliste entfernt.'
          : 'Danke! Du bist unverbindlich für FlagCount Pro vorgemerkt.'
      });
    } catch {
      setStatus({
        kind: 'error',
        message: 'Das hat gerade nicht funktioniert. Bitte versuche es später erneut.'
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="landing-section pro-preview" id="pro" aria-labelledby="pro-title">
      <div className="pro-heading">
        <div>
          <p className="eyebrow">In Planung</p>
          <h2 id="pro-title">FlagCount Pro</h2>
          <p className="lead">
            Flexible Abstimmungen und professionelle Overlays für Creator, die FlagCount regelmäßig im Stream nutzen.
            Der kostenlose Flaggenzähler bleibt kostenlos.
          </p>
        </div>
        <div className="planned-price" aria-label="FlagCount Pro Preise">
          <strong>{prices.find((price) => price.plan === 'monthly')?.total ?? '6,99 €'} / Monat</strong>
          <span>oder {prices.find((price) => price.plan === 'yearly')?.total ?? '59,00 €'} / Jahr</span>
          <small>Endgültiger Preis inkl. Steuer wird vom Zahlungsanbieter berechnet.</small>
          <div className="pro-checkout-actions">
            <button className="button primary" type="button" onClick={() => void checkout('monthly')} disabled={checkoutPlan !== null}>Monatlich starten</button>
            <button className="button" type="button" onClick={() => void checkout('yearly')} disabled={checkoutPlan !== null}>Jährlich starten</button>
          </div>
        </div>
      </div>

      <div className="feature-table-wrap">
        <table className="feature-table">
          <thead>
            <tr>
              <th scope="col">Funktion</th>
              <th scope="col">Free</th>
              <th scope="col">Pro</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map(([feature, free, pro]) => (
              <tr key={feature}>
                <th scope="row">{feature}</th>
                <td>{free}</td>
                <td>{pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pro-lower-grid">
        <div className="waitlist-card">
          <h3>Unverbindlich vormerken</h3>
          <p>
            Trag dich ein, wenn du über Entwicklung und Start informiert werden möchtest. Das ist keine Bestellung und
            es entstehen keine Kosten.
          </p>
          <form className="waitlist-form" onSubmit={(event) => void submit(event)}>
            <label htmlFor="waitlist-email">E-Mail-Adresse</label>
            <input
              id="waitlist-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              disabled={pending}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <label className="checkbox waitlist-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={pending}
                onChange={(event) => setConsent(event.currentTarget.checked)}
              />
              Ich möchte per E-Mail Neuigkeiten und den Start von FlagCount Pro erhalten. Meine Adresse wird nur dafür
              gespeichert; ich kann mich jederzeit austragen.
            </label>
            <div className="waitlist-actions">
              <button className="button primary" type="submit" value="subscribe" disabled={pending}>
                {pending ? 'Bitte warten …' : 'Vormerken'}
              </button>
              <button className="text-button" type="submit" value="unsubscribe" disabled={pending}>
                Austragen
              </button>
            </div>
            {status && (
              <p className={`waitlist-status ${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
                {status.message}
              </p>
            )}
          </form>
        </div>

        <div className="pro-faq">
          <h3>Häufige Fragen</h3>
          <details>
            <summary>Bleibt FlagCount kostenlos nutzbar?</summary>
            <p>Ja. Der rote/weiße Flaggenzähler, das Standard-Overlay und die grundlegende Gestaltung bleiben Free.</p>
          </details>
          <details>
            <summary>Kann ich Pro schon kaufen?</summary>
            <p>Nein. Checkout und Lizenzen sind noch nicht verfügbar. Die Warteliste ist ausdrücklich unverbindlich.</p>
          </details>
          <details>
            <summary>Werden Zuschauer oder Chats gespeichert?</summary>
            <p>Nein. Auch mit Pro bleiben Abstimmungen lokal; eine Historie enthält ausschließlich aggregierte Ergebnisse.</p>
          </details>
        </div>
      </div>
    </section>
  );
}
