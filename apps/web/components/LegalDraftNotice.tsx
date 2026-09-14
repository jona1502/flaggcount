/** Marks legal texts that still need to be completed and reviewed before the public launch. */
export function LegalDraftNotice() {
  return (
    <p className="legal-draft" role="note">
      Entwurf: Dieser Text ist noch nicht rechtlich geprüft. Angaben in eckigen Klammern müssen vor der Veröffentlichung ergänzt werden.
    </p>
  );
}
