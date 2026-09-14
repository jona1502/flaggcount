/** `/download` is answered by the backend with a redirect to the newest installer. */
export function DownloadButton() {
  return (
    <a className="download-button" href="/download">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      Für Windows herunterladen
    </a>
  );
}
