import { FormEvent, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Gift, Users, WalletCards } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Room } from '../api';
import { request } from '../api';
import { DatePicker } from '../components/DatePicker';
import { Snowfall } from '../components/Snowfall';
import { Button, Field, InlineError, Modal, TextAreaField } from '../components/ui';
import { CubeGift } from '../components/visual';
import { formatBudget, formatDate, todayDateInputValue } from '../utils';

const steps = [
  { title: 'Название', icon: Gift },
  { title: 'Дата и бюджет', icon: CalendarDays },
  { title: 'Пожелания', icon: WalletCards }
] as const;

const budgetPresets = [500, 1000, 2000, 3000, 5000];

function isoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** The next occurrence (today or later) of a day of the year. */
function nextDate(month: number, day: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(today.getFullYear(), month, day);
  if (date < today) date.setFullYear(date.getFullYear() + 1);
  return isoDate(date);
}

function daysFromToday(value: string) {
  const target = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

function pluralDays(days: number) {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

export function CreateRoomModal({
  token,
  onClose,
  onCreated,
  onToast
}: {
  token: string;
  onClose: () => void;
  onCreated: (room: Room) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [budget, setBudget] = useState('');
  const [wishlist, setWishlist] = useState('');
  const [links, setLinks] = useState('');

  const datePresets = useMemo(() => [
    { label: '25 декабря', value: nextDate(11, 25) },
    { label: '31 декабря', value: nextDate(11, 31) },
    { label: '7 января', value: nextDate(0, 7) }
  ], []);

  const days = date ? daysFromToday(date) : null;
  const budgetValue = budget === '' ? null : Number(budget);

  function goTo(next: number) {
    if (next > step && step === 0 && !name.trim()) {
      setError('Назовите комнату');
      return;
    }
    if (next > step && step === 1 && budgetValue !== null && (Number.isNaN(budgetValue) || budgetValue < 0)) {
      setError('Бюджет не может быть отрицательным');
      return;
    }
    setError(null);
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) {
      goTo(step + 1);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const createdRoom = await request<Room>('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          celebrationDate: date || null,
          giftBudget: budgetValue,
          wishlist: wishlist.trim(),
          wishlistLinks: links.trim()
        })
      }, token);
      onToast('success', 'Комната создана');
      onCreated(createdRoom);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать комнату';
      console.error(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Новая комната" onClose={onClose} size="xl" bare>
      <div className="create-room">
        <aside className="create-preview dark-section" aria-hidden="true">
          <Snowfall density={0.6} />
          <div className="create-preview-gift">
            <CubeGift size={128} tone="red" open={step === steps.length - 1} />
          </div>
          <div className="create-preview-card">
            <strong className={name.trim() ? '' : 'is-placeholder'}>{name.trim() || 'Новая комната'}</strong>
            <div className="create-preview-facts">
              <span><CalendarDays size={15} />{date ? formatDate(date) : 'Дата не выбрана'}</span>
              <span><WalletCards size={15} />{budgetValue !== null && !Number.isNaN(budgetValue) ? formatBudget(budgetValue) : 'Без бюджета'}</span>
              <span><Users size={15} />Вы — организатор</span>
            </div>
            {days !== null && days >= 0 && (
              <span className="create-preview-count">
                <b>{days}</b> {days === 0 ? 'праздник сегодня' : `${pluralDays(days)} до праздника`}
              </span>
            )}
          </div>
        </aside>

        <form className="create-form" onSubmit={submit} noValidate>
          <ol className="create-steps" aria-label="Шаги">
            {steps.map(({ title, icon: Icon }, index) => (
              <li key={title}>
                <button
                  type="button"
                  className={`create-step ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`}
                  onClick={() => (index < step ? goTo(index) : undefined)}
                  disabled={index > step}
                  aria-current={index === step ? 'step' : undefined}
                >
                  <span className="create-step-dot">{index < step ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}</span>
                  <span className="create-step-title">{title}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="create-body">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={step}
                className="create-pane"
                custom={direction}
                initial={{ opacity: 0, x: 28 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 * direction }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                {step === 0 && (
                  <>
                    <h3>Как назовём комнату?</h3>
                    <Field label="Название" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={140} placeholder="Новогодний обмен 2026" autoFocus required />
                    <TextAreaField label="Описание" name="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={800} placeholder="Где и когда встречаемся, дресс-код, настроение" rows={3} />
                  </>
                )}
                {step === 1 && (
                  <>
                    <h3>Когда праздник и сколько тратим?</h3>
                    <div className="create-group">
                      <span className="field-label">Дата праздника</span>
                      <div className="chip-row">
                        {datePresets.map((preset) => (
                          <button key={preset.value} type="button" className={`chip ${date === preset.value ? 'is-selected' : ''}`} onClick={() => setDate(preset.value)}>
                            {preset.label}
                          </button>
                        ))}
                        <DatePicker
                          className="date-picker-chip"
                          value={datePresets.some((preset) => preset.value === date) ? '' : date}
                          onChange={setDate}
                          min={todayDateInputValue()}
                          placeholder="Другая дата"
                          clearable={false}
                        />
                      </div>
                    </div>
                    <div className="create-group">
                      <span className="field-label">Бюджет подарка</span>
                      <div className="chip-row">
                        {budgetPresets.map((preset) => (
                          <button key={preset} type="button" className={`chip ${budgetValue === preset ? 'is-selected' : ''}`} onClick={() => setBudget(String(preset))}>
                            {preset.toLocaleString('ru-RU')} ₽
                          </button>
                        ))}
                        <label className="chip-input chip-input-money">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="100"
                            placeholder="Своя сумма"
                            aria-label="Своя сумма"
                            value={budget}
                            onChange={(event) => setBudget(event.target.value)}
                          />
                          <span>₽</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <h3>Что подарить вам?</h3>
                    <TextAreaField label="Пожелания" name="wishlist" value={wishlist} onChange={(event) => setWishlist(event.target.value)} maxLength={1000} placeholder="Книги, кофе, настольная игра…" rows={3} />
                    <TextAreaField label="Ссылки" name="wishlistLinks" value={links} onChange={(event) => setLinks(event.target.value)} maxLength={1500} placeholder="Одна ссылка на строку" rows={2} />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <InlineError message={error} />

          <div className="create-actions">
            {step === 0 ? (
              <Button variant="secondary" onClick={onClose}>Отмена</Button>
            ) : (
              <Button variant="secondary" onClick={() => goTo(step - 1)}><ArrowLeft size={16} />Назад</Button>
            )}
            <Button type="submit" variant="accent" loading={loading}>
              {step < steps.length - 1 ? <>Далее<ArrowRight size={16} /></> : <><Gift size={17} />Создать комнату</>}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
