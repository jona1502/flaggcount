const FEATURES = [
  ['Abstimmungen', 'Rote und weiße Flaggen', '2–6 Optionen, eigene Emojis und Begriffe'],
  ['Gleichzeitig aktiv', '1 Zähler', 'Bis zu 4 Zähler'],
  ['Stream-Profile', '1 Profil', 'Bis zu 10 Profile'],
  ['Overlays', 'Standard, lokal und online', 'Premium-Vorlagen und je Zähler eine URL'],
  ['Auswertung', 'Aktuelle Runde', 'Lokale Historie und CSV-Export'],
  ['Design', 'Farben, Position, Größe und Effekte', 'Logo, Schriften und eigener Hintergrund']
] as const;

export function FeatureTable() {
  return (
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
  );
}

export function ProFaq() {
  return (
    <div className="pro-faq">
      <h3>Häufige Fragen</h3>
      <details>
        <summary>Bleibt Audience Live kostenlos nutzbar?</summary>
        <p>Ja. Der rote/weiße Flaggenzähler, das Standard-Overlay und die grundlegende Gestaltung bleiben Free.</p>
      </details>
      <details>
        <summary>Wie läuft der Kauf ab?</summary>
        <p>
          Bezahlt wird über Stripe. Nach der Zahlung bekommst du einen Aktivierungscode per E-Mail und aktivierst Pro damit in der App – ein
          Ein Audience-Live-Konto brauchst du nicht. Rechnungen, Zahlungsmethode und Kündigung verwaltest du im Kundenportal von Stripe.
        </p>
      </details>
      <details>
        <summary>Auf wie vielen Computern kann ich Pro nutzen?</summary>
        <p>Auf bis zu drei Computern gleichzeitig. Einen alten Computer kannst du beim Aktivieren eines neuen ersetzen.</p>
      </details>
      <details>
        <summary>Welche Daten speichert Audience Live für Pro?</summary>
        <p>
          Nur Kennungen des Stripe-Kunden und Abos, den Abo-Status und pseudonyme Kennungen deiner aktivierten Computer. Namen, E-Mail- und
          Zahlungsdaten verarbeitet Stripe; Audience Live speichert sie nicht.
        </p>
      </details>
      <details>
        <summary>Werden Zuschauer oder Chats gespeichert?</summary>
        <p>Nein. Auch mit Pro bleiben Abstimmungen lokal; eine Historie enthält ausschließlich aggregierte Ergebnisse.</p>
      </details>
    </div>
  );
}
