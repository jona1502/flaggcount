import Link from 'next/link';
import type { CheckoutStatus } from '../lib/backend';
import { DownloadButton } from './DownloadButton';

type Result = CheckoutStatus | 'unavailable';

function NextSteps() {
  return (
    <>
      <ol className="steps">
        <li className="step">
          <h3>E-Mail abwarten</h3>
          <p>
            Keine Nachricht erhalten? Schau auch im Spam-Ordner nach oder <Link href="/lizenz-wiederherstellen">fordere den Code neu an</Link>.
          </p>
        </li>
        <li className="step">
          <h3>Code in FlagCount eingeben</h3>
          <p>Öffne FlagCount auf deinem Windows-PC, wechsle zu „Pro“ und aktiviere den Code.</p>
        </li>
        <li className="step">
          <h3>Abo verwalten</h3>
          <p>
            Rechnungen, Zahlungsmethode und Kündigung findest du in der App unter „Abo verwalten“ oder <Link href="/abo-verwalten">hier</Link>.
          </p>
        </li>
      </ol>
      <div className="download-row">
        <DownloadButton />
      </div>
    </>
  );
}

function BackToPro({ label = 'Zurück zu FlagCount Pro' }: { label?: string }) {
  return (
    <div className="pro-checkout-actions">
      <Link className="button primary" href="/pro">
        {label}
      </Link>
      <Link className="button" href="/lizenz-wiederherstellen">
        Lizenz wiederherstellen
      </Link>
    </div>
  );
}

/** What the return page says for each checkout state. It never unlocks Pro itself. */
export function CheckoutResult({ result }: { result: Result }) {
  if (result === 'unavailable') {
    return (
      <>
        <h1 id="checkout-result-title">Status gerade nicht abrufbar</h1>
        <p className="lead">
          Wir können den Checkout im Moment nicht prüfen. Wenn deine Zahlung durchgegangen ist, kommt der Aktivierungscode trotzdem per E-Mail.
          Lade die Seite in ein paar Minuten neu.
        </p>
        <NextSteps />
      </>
    );
  }

  switch (result.status) {
    case 'complete':
      return result.paid ? (
        <>
          <h1 id="checkout-result-title">Danke für deinen Kauf!</h1>
          <p className="lead">
            Deine Zahlung ist bei Stripe eingegangen. Wir schicken deinen Aktivierungscode an die E-Mail-Adresse aus dem Checkout; das dauert meist
            nur wenige Minuten.
          </p>
          <NextSteps />
        </>
      ) : (
        <>
          <h1 id="checkout-result-title">Zahlung wird bestätigt</h1>
          <p className="lead">
            Dein Checkout ist abgeschlossen, die Zahlung ist aber noch nicht bestätigt, zum Beispiel bei einer Lastschrift. Sobald sie eingeht,
            bekommst du den Aktivierungscode per E-Mail.
          </p>
          <NextSteps />
        </>
      );
    case 'open':
      return (
        <>
          <h1 id="checkout-result-title">Checkout noch nicht abgeschlossen</h1>
          <p className="lead">Der Kauf wurde noch nicht abgeschlossen, es wurde nichts berechnet.</p>
          <BackToPro label="Checkout erneut starten" />
        </>
      );
    case 'expired':
      return (
        <>
          <h1 id="checkout-result-title">Checkout abgelaufen</h1>
          <p className="lead">Dieser Checkout ist abgelaufen, es wurde nichts berechnet. Du kannst jederzeit einen neuen starten.</p>
          <BackToPro label="Neuen Checkout starten" />
        </>
      );
    case 'unknown':
      return (
        <>
          <h1 id="checkout-result-title">Kein Kauf gefunden</h1>
          <p className="lead">
            Zu diesem Link gibt es keinen abgeschlossenen Kauf. Hast du bereits bezahlt, kommt dein Aktivierungscode per E-Mail oder du forderst ihn
            neu an.
          </p>
          <BackToPro />
        </>
      );
  }
}
