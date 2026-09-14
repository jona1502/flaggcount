import { useState, type FormEvent } from 'react';
import type { AppError } from '../../shared/appState';
import { MAX_NAME_LENGTH } from '../../shared/profiles';
import { Button, Callout, Dialog, Field, Input } from '../components/ui';
import { getErrorMessage } from '../dashboard/errorMessages';

type CreateProfileDialogProps = {
  busy: boolean;
  /** Shown here because the dialog covers the global error banner. */
  error: AppError | null;
  onCancel: () => void;
  onCreate: (name: string) => void;
};

export function CreateProfileDialog({ busy, error, onCancel, onCreate }: CreateProfileDialogProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const submit = (event?: FormEvent<HTMLFormElement>): void => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setValidation('Bitte gib dem Profil einen Namen.');
      return;
    }
    setValidation(null);
    setAttempted(true);
    onCreate(trimmed);
  };

  return (
    <Dialog
      open
      title="Neues Profil"
      description="Ein neues Profil startet mit dem Zähler für rote Flaggen. Zähler, Abstimmungen und Overlays richtest du danach ein."
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy && attempted} onClick={() => submit()}>
            Anlegen
          </Button>
        </>
      }
    >
      <form className="dialog-form" onSubmit={submit} noValidate>
        <Field id="new-profile-name" label="Neues Profil" hint="z. B. Quiz-Abend oder Turnier" error={validation}>
          <Input value={name} maxLength={MAX_NAME_LENGTH} data-autofocus onChange={(event) => setName(event.target.value)} />
        </Field>
        {attempted && error && !busy && (
          <Callout tone="danger" title="Das Profil wurde nicht angelegt" role="alert">
            {getErrorMessage(error.code)}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
