import { AlertCircle, Check, Gift, Info, Loader2, X } from 'lucide-react';
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import type { ToastMessage } from '../types';
import { getInitials } from '../utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  function moveMagnet(event: React.PointerEvent<HTMLButtonElement>) {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 6;
    button.style.setProperty('--magnet-x', `${x.toFixed(2)}px`);
    button.style.setProperty('--magnet-y', `${y.toFixed(2)}px`);
  }

  function resetMagnet(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.setProperty('--magnet-x', '0px');
    event.currentTarget.style.setProperty('--magnet-y', '0px');
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`btn btn-${variant} ${className}`.trim()}
      onPointerMove={(event) => {
        moveMagnet(event);
        props.onPointerMove?.(event);
      }}
      onPointerLeave={(event) => {
        resetMagnet(event);
        props.onPointerLeave?.(event);
      }}
    >
      <span className="btn-magnetic-content">
        {loading && <Loader2 className="spin" size={17} aria-hidden="true" />}
        {children}
      </span>
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button {...props} aria-label={label} title={label} className={`icon-btn ${className}`.trim()}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function TextAreaField({
  label,
  hint,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      <textarea {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Card({
  children,
  className = '',
  style
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  function moveSpotlight(event: React.PointerEvent<HTMLElement>) {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${localX}px`);
    card.style.setProperty('--mouse-y', `${localY}px`);
    card.style.setProperty('--px', `${(localX / rect.width) * 100}%`);
    card.style.setProperty('--py', `${(localY / rect.height) * 100}%`);
    card.style.setProperty('--h', '1');
    card.style.setProperty('--tilt-x', `${(((event.clientY - rect.top) / rect.height) - 0.5) * -2.2}deg`);
    card.style.setProperty('--tilt-y', `${(((event.clientX - rect.left) / rect.width) - 0.5) * 2.6}deg`);
  }

  function resetSpotlight(event: React.PointerEvent<HTMLElement>) {
    const card = event.currentTarget;
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--h', '0');
  }

  return (
    <section
      className={`card spotlight-card ${className}`.trim()}
      style={style}
      onPointerMove={moveSpotlight}
      onPointerLeave={resetSpotlight}
      data-reveal
    >
      {children}
    </section>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  size = 'normal'
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'normal' | 'wide';
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Закрыть окно" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmText,
  danger,
  loading,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} description={description} onClose={onCancel}>
      <div className="dialog-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button type="button" variant={danger ? 'danger' : 'accent'} loading={loading} onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

export function Avatar({
  name,
  avatarUrl,
  size = 'md',
  className = ''
}: {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const classes = `avatar avatar-${size} ${className}`.trim();
  if (avatarUrl) {
    return <img className={classes} src={avatarUrl} alt={name} />;
  }
  return <div className={classes} aria-label={name}>{getInitials(name)}</div>;
}

export function EmptyState({
  title,
  text,
  action
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <Card className="empty-state">
      <div className="empty-orbit" aria-hidden="true">
        <Gift size={44} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </Card>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="room-cards">
      {Array.from({ length: count }).map((_, index) => (
        <div className="card skeleton-card" key={index}>
          <span className="skeleton skeleton-icon" />
          <span className="skeleton skeleton-line wide" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function Toasts({
  toasts,
  onDismiss
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.type}`} key={toast.id}>
          {toast.type === 'success' ? <Check size={18} /> : toast.type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
          <span>{toast.message}</span>
          <button type="button" aria-label="Закрыть уведомление" onClick={() => onDismiss(toast.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="inline-error" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  );
}
