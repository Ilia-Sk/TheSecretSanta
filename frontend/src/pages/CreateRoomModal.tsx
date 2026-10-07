import { FormEvent, useState } from 'react';
import { CalendarDays, Gift, ScrollText, Sparkles, WalletCards } from 'lucide-react';
import type { Room } from '../api';
import { request } from '../api';
import { Button, Field, Modal, TextAreaField } from '../components/ui';
import { todayDateInputValue } from '../utils';

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
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const createdRoom = await request<Room>('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          description: String(form.get('description') ?? '').trim(),
          celebrationDate: form.get('celebrationDate') ? String(form.get('celebrationDate')) : null,
          giftBudget: form.get('giftBudget') ? Number(form.get('giftBudget')) : null,
          wishlist: String(form.get('wishlist') ?? '').trim(),
          wishlistLinks: String(form.get('wishlistLinks') ?? '').trim()
        })
      }, token);
      onToast('success', 'Комната создана');
      onCreated(createdRoom);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать комнату';
      console.error(err);
      onToast('error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Новая комната" description="Настройте атмосферу обмена: название, дату, бюджет и свои пожелания." onClose={onClose} size="wide">
      <form className="create-room-form" onSubmit={submit}>
        <section className="form-block">
          <div className="form-block-title"><ScrollText size={18} /><span>Детали</span></div>
          <Field label="Название" name="name" maxLength={140} placeholder="Новогодний обмен 2026" required />
          <TextAreaField label="Описание" name="description" maxLength={800} placeholder="Формат обмена, место встречи или настроение праздника" />
        </section>

        <section className="form-block">
          <div className="form-block-title"><CalendarDays size={18} /><span>Параметры обмена</span></div>
          <div className="form-two">
            <Field label="Дата праздника" name="celebrationDate" type="date" min={todayDateInputValue()} />
            <Field label="Бюджет подарка" name="giftBudget" type="number" min="0" step="100" placeholder="3000" />
          </div>
        </section>

        <section className="form-block form-block-accent">
          <div className="form-block-title"><WalletCards size={18} /><span>Ваши пожелания</span></div>
          <TextAreaField label="Пожелания" name="wishlist" maxLength={1000} placeholder="Книги, кофе, сертификат, настольная игра..." />
          <TextAreaField label="Ссылки" name="wishlistLinks" maxLength={1500} placeholder="Одна ссылка на строку" />
        </section>

        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="accent" loading={loading}>
            <Gift size={17} />
            Создать комнату
          </Button>
        </div>

        <div className="form-footnote"><Sparkles size={15} /> После создания можно будет скопировать элегантное приглашение.</div>
      </form>
    </Modal>
  );
}
