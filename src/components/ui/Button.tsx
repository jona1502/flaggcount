import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx';
import type { IconComponent } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconComponent;
  /** Shows a spinner and blocks the button while its action runs. */
  loading?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      type={type}
      className={cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : Icon && <Icon size={size === 'lg' ? 20 : 16} />}
      {children !== undefined && <span className="ui-button-label">{children}</span>}
    </button>
  );
}

type IconButtonProps = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  /** Required accessible name; also shown as the native tooltip. */
  label: string;
  icon: IconComponent;
  variant?: 'ghost' | 'secondary' | 'danger-outline';
  size?: ButtonSize;
};

export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  title,
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx('ui-icon-button', `ui-button--${variant}`, `ui-icon-button--${size}`, className)}
    >
      <Icon size={size === 'sm' ? 14 : size === 'lg' ? 22 : 18} />
    </button>
  );
}
