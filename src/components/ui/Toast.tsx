import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './Button';
import { cx } from './cx';
import { IconAlert, IconCheck, IconClose, IconInfo, type IconComponent } from './icons';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export type ToastInput = {
  tone?: ToastTone;
  title: string;
  description?: string;
};

type ToastEntry = ToastInput & { id: number; tone: ToastTone };

const ICONS: Record<ToastTone, IconComponent> = { success: IconCheck, info: IconInfo, warning: IconAlert, danger: IconAlert };

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

/** Shows a short confirmation of a finished action. Field and connection errors are shown where they happen instead. */
export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}

function ToastItem({ toast, durationMs, onDismiss }: { toast: ToastEntry; durationMs: number; onDismiss: (id: number) => void }): React.JSX.Element {
  useEffect(() => {
    const timeout = setTimeout(() => onDismiss(toast.id), durationMs);
    return () => clearTimeout(timeout);
  }, [toast.id, durationMs, onDismiss]);

  const Icon = ICONS[toast.tone];
  return (
    <li className={cx('ui-toast', `ui-toast--${toast.tone}`)}>
      <Icon className="ui-toast-icon" />
      <div className="ui-toast-body">
        <p className="ui-toast-title">{toast.title}</p>
        {toast.description && <p className="ui-toast-description">{toast.description}</p>}
      </div>
      <IconButton label="Benachrichtigung schließen" icon={IconClose} size="sm" onClick={() => onDismiss(toast.id)} />
    </li>
  );
}

export function ToastProvider({ children, durationMs = 4500 }: { children: ReactNode; durationMs?: number }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const show = useCallback((toast: ToastInput) => {
    const entry: ToastEntry = { ...toast, tone: toast.tone ?? 'success', id: nextId.current++ };
    // Only the latest few stay visible so a burst of actions does not cover the page.
    setToasts((current) => [...current.slice(-2), entry]);
  }, []);
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The live region exists before any toast, so assistive technology announces new ones reliably. */}
      <section className="ui-toast-region" aria-label="Benachrichtigungen">
        <ol aria-live="polite" aria-relevant="additions text">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} durationMs={durationMs} onDismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}
