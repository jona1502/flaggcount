type PrivacyPanelProps = {
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
};

export function PrivacyPanel({ enabled, disabled, onChange }: PrivacyPanelProps): React.JSX.Element {
  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-heading">
      <div>
        <h2 id="privacy-heading">Datenschutz</h2>
        <p className="hint">
          Hilf FlagCount mit anonymen Nutzungsdaten. Benutzernamen, Zuschauer, Chattexte und eigene Inhalte werden nie
          übertragen.
        </p>
      </div>
      <label className="checkbox privacy-toggle">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        Anonyme Nutzungsdaten senden
      </label>
    </section>
  );
}
