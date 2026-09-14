import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';

type ControlProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** A single input, select or textarea; it receives the id and descriptions. */
  children: ReactElement<ControlProps>;
  className?: string;
  /** Shown next to the label for fields that are not needed. */
  optional?: boolean;
};

/** Label, hint and field error wired to the control, so screen readers announce all of them. */
export function Field({ id, label, hint, error, children, className, optional = false }: FieldProps): React.JSX.Element {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ui-field', className)} data-invalid={error ? true : undefined}>
      <label className="ui-field-label" htmlFor={id}>
        {label}
        {optional && <span className="ui-field-optional"> (optional)</span>}
      </label>
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId ?? undefined} className="ui-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId ?? undefined} className="ui-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>): React.JSX.Element {
  return <input {...props} className={cx('ui-input', className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>): React.JSX.Element {
  return (
    <select {...props} className={cx('ui-select', className)}>
      {children}
    </select>
  );
}

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
};

export function Switch({ checked, onChange, label, description, disabled = false, id }: SwitchProps): React.JSX.Element {
  const descriptionId = description && id ? `${id}-description` : undefined;
  return (
    <div className="ui-switch-row">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        className="ui-switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-track" aria-hidden="true">
          <span className="ui-switch-thumb" />
        </span>
        <span className="ui-switch-label">{label}</span>
      </button>
      {description && (
        <p id={descriptionId} className="ui-field-hint">
          {description}
        </p>
      )}
    </div>
  );
}
