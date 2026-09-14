import appIcon from '../../src-tauri/icons/128x128@2x.png';

/**
 * Stripe sends buyers here after Checkout. The page deliberately unlocks nothing and reads nothing from
 * the URL: the license is created only after Stripe's signed webhook confirmed the payment.
 */
export function CheckoutSuccess(): React.JSX.Element {
  return (
    <div className="landing">
      <header className="landing-inner landing-nav">
        <a className="landing-logo" href="/">
          <img src={appIcon} alt="" width={28} height={28} />
          FlagCount
        </a>
      </header>

      <main className="landing-inner">
        <section className="landing-section checkout-success" aria-labelledby="checkout-success-title">
          <p className="eyebrow">FlagCount Pro</p>
          <h1 id="checkout-success-title">Danke für deinen Kauf!</h1>
          <p className="lead">
            Sobald Stripe die Zahlung bestätigt hat, schicken wir deinen Aktivierungscode an die E-Mail-Adresse, die du im
            Checkout angegeben hast. Das dauert meist nur wenige Minuten.
          </p>
          <ol className="steps">
            <li className="step">
              <h3>E-Mail abwarten</h3>
              <p>Keine Nachricht erhalten? Schau auch im Spam-Ordner nach.</p>
            </li>
            <li className="step">
              <h3>Code in FlagCount eingeben</h3>
              <p>Öffne FlagCount auf deinem Windows-PC, wechsle zu „Pro“ und aktiviere den Code.</p>
            </li>
            <li className="step">
              <h3>Abo verwalten</h3>
              <p>Rechnungen, Zahlungsmethode und Kündigung findest du später in der App unter „Abo verwalten“.</p>
            </li>
          </ol>
          <div className="download-row">
            <a className="download-button" href="/download">
              Für Windows herunterladen
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-inner landing-footer">
        <span>FlagCount ist kein offizielles Produkt von TikTok.</span>
      </footer>
    </div>
  );
}
