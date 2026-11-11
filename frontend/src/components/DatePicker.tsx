import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CSSProperties, KeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

/**
 * Calendar date picker (instead of the browser's native <input type="date">,
 * which looks different in every browser). A pill trigger opens a popover month
 * grid: Monday-first weeks, today ringed, past days disabled, arrow keys move
 * the focus, Enter picks, Esc closes. Value is an ISO "yyyy-mm-dd" string.
 *
 * Works controlled (value + onChange) or inside a plain form (name + defaultValue:
 * a hidden input carries the value).
 */
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function toIso(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function fromIso(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** 42 days (6 weeks) starting on the Monday on/before the 1st of the month. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function formatLong(date: Date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function DatePicker({
  value,
  defaultValue,
  onChange,
  name,
  min,
  label,
  placeholder = 'Выберите дату',
  clearable = true,
  className = ''
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  /** Earliest selectable day, "yyyy-mm-dd". */
  min?: string;
  label?: string;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = value ?? inner;
  const selected = fromIso(current);
  const minDate = fromIso(min);
  const today = useMemo(startOfToday, []);

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(selected ?? (minDate && minDate > today ? minDate : today));
  const [direction, setDirection] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ style: CSSProperties; up: boolean }>({ style: {}, up: false });
  const labelId = useId();
  const dialogId = useId();

  const viewYear = cursor.getFullYear();
  const viewMonth = cursor.getMonth();
  const days = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function commit(next: string) {
    if (value === undefined) setInner(next);
    onChange?.(next);
  }

  function isDisabled(date: Date) {
    return Boolean(minDate && date < minDate);
  }

  function openPicker() {
    setCursor(selected ?? (minDate && minDate > today ? minDate : today));
    setDirection(0);
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function moveCursor(next: Date) {
    if (next.getMonth() !== cursor.getMonth() || next.getFullYear() !== cursor.getFullYear()) {
      setDirection(next > cursor ? 1 : -1);
    }
    setCursor(next);
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    const day = Math.min(cursor.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate());
    setDirection(delta);
    setCursor(new Date(next.getFullYear(), next.getMonth(), day));
  }

  function pick(date: Date) {
    if (isDisabled(date)) return;
    commit(toIso(date));
    close();
  }

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // The popover lives in <body> (so modals and cards can't clip it) and is placed
  // under the trigger, or above it when there is no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = triggerRef.current;
      const pop = popoverRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = pop?.offsetWidth ?? 312;
      const height = pop?.offsetHeight ?? 360;
      const gap = 8;
      const up = rect.bottom + gap + height > window.innerHeight - 8 && rect.top - gap - height > 8;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPlace({ up, style: { position: 'fixed', left, top: up ? rect.top - gap - height : rect.bottom + gap } });
    };
    reposition();
    const raf = requestAnimationFrame(reposition);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // Keep keyboard focus on the cursor day.
  useEffect(() => {
    if (!open) return;
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toIso(cursor)}"]`);
    button?.focus({ preventScroll: true });
  }, [open, cursor]);

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in steps) {
      event.preventDefault();
      moveCursor(addDays(cursor, steps[event.key]));
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      shiftMonth(event.key === 'PageUp' ? -1 : 1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const weekday = (cursor.getDay() + 6) % 7;
      moveCursor(addDays(cursor, event.key === 'Home' ? -weekday : 6 - weekday));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(cursor);
    }
  }

  const canGoBack = !minDate || new Date(viewYear, viewMonth, 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1);

  return (
    <div
      ref={rootRef}
      className={`date-picker ${open ? 'is-open' : ''} ${className}`.trim()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      {label && <span className="field-label" id={labelId}>{label}</span>}
      {name && <input type="hidden" name={name} value={current} />}
      <div className="date-trigger-row">
        <button
          ref={triggerRef}
          type="button"
          className={`date-trigger ${selected ? 'has-value' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          aria-labelledby={label ? labelId : undefined}
          onClick={() => (open ? close(false) : openPicker())}
        >
          <CalendarDays size={17} />
          <span className="date-trigger-text">{selected ? formatLong(selected).replace(/\s*г\.$/, '') : placeholder}</span>
        </button>
        {clearable && selected && (
          <button type="button" className="date-clear" aria-label="Очистить дату" onClick={() => commit('')}>
            <X size={15} />
          </button>
        )}
      </div>

      {createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            id={dialogId}
            className="date-popover"
            role="dialog"
            aria-label="Календарь"
            style={place.style}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                close();
              }
            }}
            initial={{ opacity: 0, y: place.up ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: place.up ? 6 : -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="date-head">
              <button type="button" className="date-nav" onClick={() => shiftMonth(-1)} disabled={!canGoBack} aria-label="Предыдущий месяц">
                <ChevronLeft size={18} />
              </button>
              <strong aria-live="polite">{MONTHS[viewMonth]} {viewYear}</strong>
              <button type="button" className="date-nav" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="date-weekdays" aria-hidden="true">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>

            <div className="date-grid-clip" ref={gridRef}>
              <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                <motion.div
                  key={`${viewYear}-${viewMonth}`}
                  className="date-grid"
                  role="grid"
                  onKeyDown={onGridKey}
                  custom={direction}
                  variants={{
                    enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
                    center: { opacity: 1, x: 0 },
                    exit: (dir: number) => ({ opacity: 0, x: dir * -24 })
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {days.map((date) => {
                    const iso = toIso(date);
                    const outside = date.getMonth() !== viewMonth;
                    const disabled = isDisabled(date);
                    const isSelected = current === iso;
                    const isToday = date.getTime() === today.getTime();
                    const isCursor = date.getTime() === cursor.getTime();
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="gridcell"
                        data-day={iso}
                        tabIndex={isCursor ? 0 : -1}
                        aria-selected={isSelected}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={formatLong(date)}
                        disabled={disabled}
                        className={[
                          'date-day',
                          outside && 'is-outside',
                          isSelected && 'is-selected',
                          isToday && 'is-today'
                        ].filter(Boolean).join(' ')}
                        onClick={() => pick(date)}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="date-foot">
              <button type="button" className="text-link" onClick={() => pick(minDate && minDate > today ? minDate : today)}>
                {minDate && minDate > today ? 'Ближайшая дата' : 'Сегодня'}
              </button>
              {clearable && selected && (
                <button type="button" className="text-link date-foot-muted" onClick={() => { commit(''); close(); }}>
                  Очистить
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
