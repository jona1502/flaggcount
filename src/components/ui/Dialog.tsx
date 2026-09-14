import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { IconClose } from './icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.closest('[inert]'));
}

type DialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** A drawer slides in from the side for longer, secondary content. */
  variant?: 'dialog' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/**
 * Modal dialog: focus moves inside (to the element marked `data-autofocus`, otherwise the first control),
 * Tab stays within it, Escape and the backdrop close it and focus returns to where it was.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  variant = 'dialog',
  size = 'md',
  className
}: DialogProps): React.JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = panel.current;
    if (container) {
      const target = container.querySelector<HTMLElement>('[data-autofocus]') ?? focusableIn(container)[0] ?? container;
      target.focus();
    }
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = focusableIn(panel.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={cx('ui-dialog-backdrop', `ui-dialog-backdrop--${variant}`)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx('ui-dialog', `ui-dialog--${variant}`, `ui-dialog--${size}`, className)}
        onKeyDown={onKeyDown}
      >
        <header className="ui-dialog-header">
          <div>
            <h2 id={titleId} className="ui-dialog-title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="ui-dialog-description">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Dialog schließen" icon={IconClose} onClick={onClose} />
        </header>
        <div className="ui-dialog-body">{children}</div>
        {footer && <footer className="ui-dialog-footer">{footer}</footer>}
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive confirmations use the danger style. */
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Asks before an action that cannot be undone. Focus starts on "Abbrechen" so a repeated key press is safe. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element | null {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ui-confirm-message">{message}</div>
    </Dialog>
  );
}
