import { AlertCircle, Check, Info, Loader2, X } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform
} from 'motion/react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import type { ToastMessage } from '../types';
import { getInitials } from '../utils';
import { BlurFade } from './magicui';
import { CubeGift } from './visual';
import { pushOverlay } from '../hooks/overlay';

/**
 * One button for the whole site. Variants only change colours; every button has
 * the same motion (styles.css → .btn): a slight lift on hover, an even press.
 *  - accent    gold, the main action on a screen
 *  - primary   dark ink
 *  - secondary soft grey
 *  - ghost     text-only
 *  - danger    destructive
 *  - light     white, for dark sections
 *  - outline   transparent with a light border, for dark sections
 */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'light' | 'outline';

type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  disabled,
  type = 'button',
  ...props
}: NativeButtonProps & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn btn-${variant} ${className}`.trim()}
    >
      <span className="btn-content">
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
}: NativeButtonProps & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      title={label}
      className={`icon-btn ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  className = '',
  trailing,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  /** Element inside the input on the right (e.g. the show-password button). */
  trailing?: ReactNode;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">{label}</span>
      {trailing ? (
        <span className="field-control">
          <input {...props} />
          {trailing}
        </span>
      ) : (
        <input {...props} />
      )}
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
      <span className="field-label">{label}</span>
      <textarea {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

/**
 * Content tile. Calm on purpose: no tilt, no lift, no cursor effects — cards
 * people click often must stay put. Only a one-time fade-up when scrolled into view.
 */
export function Card({
  children,
  className = '',
  style,
  reveal = true,
  delay = 0,
  layoutId
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** @deprecated kept for old call sites; cards never tilt now. */
  tilt?: boolean;
  reveal?: boolean;
  delay?: number;
  /** Shared-element id: the card morphs into another element with the same id. */
  layoutId?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      layoutId={layoutId}
      className={`card ${className}`.trim()}
      style={style}
      initial={reveal && !reduced ? { opacity: 0, y: 24 } : false}
      whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  size = 'normal',
  tone = 'light',
  bare = false
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'normal' | 'wide' | 'xl';
  tone?: 'light' | 'dark';
  /** No standard header: the content lays itself out (the title stays for screen readers). */
  bare?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    const releaseOverlay = pushOverlay();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      releaseOverlay();
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <motion.div
      className={`modal-backdrop modal-backdrop-${tone}`}
      role="presentation"
      onMouseDown={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.22 } }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        className={`modal modal-${size} modal-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98, transition: { duration: 0.16, ease: 'easeIn' } }}
        transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}
      >
        {bare ? (
          <>
            <h2 id="modal-title" className="visually-hidden">{title}</h2>
            <IconButton label="Закрыть окно" onClick={onClose} className="modal-close modal-close-floating">
              <X size={18} />
            </IconButton>
            {children}
          </>
        ) : (
          <>
            <div className="modal-head">
              <div>
                <h2 id="modal-title">{title}</h2>
                {description && <p>{description}</p>}
              </div>
              <IconButton label="Закрыть окно" onClick={onClose} className="modal-close">
                <X size={18} />
              </IconButton>
            </div>
            {/* The body scrolls inside the rounded window, so the scrollbar never crosses its corners. */}
            <div className="modal-body">{children}</div>
          </>
        )}
      </motion.div>
    </motion.div>,
    document.body
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
        <Button type="button" variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button type="button" variant={danger ? 'danger' : 'accent'} loading={loading} onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

const avatarPalettes = [
  ['#f5c66b', '#e08a2e'],
  ['#5f8bff', '#64d2ff'],
  ['#34c38f', '#9be15d'],
  ['#b06ab3', '#ff8fb1'],
  ['#ff7a59', '#ffb36b'],
  ['#4f6bed', '#8e7bff'],
  ['#d9573b', '#f08a5d']
];

function avatarGradient(name: string) {
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const [from, to] = avatarPalettes[(hash >>> 0) % avatarPalettes.length];
  return `linear-gradient(140deg, ${from}, ${to})`;
}

export function Avatar({
  name,
  avatarUrl,
  size = 'md',
  className = ''
}: {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const classes = `avatar avatar-${size} ${className}`.trim();
  if (avatarUrl) {
    return <img className={classes} src={avatarUrl} alt={name} />;
  }
  return (
    <div className={classes} role="img" aria-label={name} style={{ background: avatarGradient(name) }}>
      {getInitials(name)}
    </div>
  );
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
      <CubeGift size={86} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </Card>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="room-cards" aria-busy="true" aria-label="Загрузка">
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
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            layout
            className={`toast glass toast-${toast.type}`}
            key={toast.id}
            initial={{ opacity: 0, y: -24, scale: 0.9, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <span className="toast-icon">
              {toast.type === 'success' ? <Check size={16} /> : toast.type === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
            </span>
            <span className="toast-text">{toast.message}</span>
            <button type="button" aria-label="Закрыть уведомление" onClick={() => onDismiss(toast.id)}>
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key={message}
          className="inline-error"
          role="alert"
          initial={{ opacity: 0, height: 0, x: 0 }}
          animate={{ opacity: 1, height: 'auto', x: [0, -6, 5, -3, 0] }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4 }}
        >
          <AlertCircle size={17} />
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** iOS-style segmented control; the selection thumb slides with a shared layout animation. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  layoutId
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; id?: string; controls?: string }>;
  onChange: (value: T) => void;
  label: string;
  layoutId: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          role="tab"
          key={option.value}
          id={option.id}
          aria-controls={option.controls}
          aria-selected={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {value === option.value && (
            <motion.span layoutId={layoutId} className="segmented-thumb" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          )}
          <span className="segmented-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  text,
  action,
  centered = false
}: {
  eyebrow?: string;
  title: ReactNode;
  text?: string;
  action?: ReactNode;
  centered?: boolean;
}) {
  return (
    <BlurFade className={centered ? 'section-title centered' : 'section-title'}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      {action}
    </BlurFade>
  );
}
