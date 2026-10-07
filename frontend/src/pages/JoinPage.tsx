import { FormEvent, useEffect, useRef, useState } from 'react';
import { Ticket } from 'lucide-react';
import type { InvitePreview, Room } from '../api';
import { request } from '../api';
import { Button, Card, SkeletonCards, TextAreaField } from '../components/ui';
import { useRevealOnView } from '../hooks/useRevealOnView';

export function JoinPage({
  token,
  inviteCode,
  onJoined,
  onToast,
  onCancel
}: {
  token: string;
  inviteCode: string;
  onJoined: (room: Room) => void;
  onCancel: () => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  useRevealOnView(pageRef);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    setLoading(true);
    request<InvitePreview>(`/rooms/invite/${encodeURIComponent(inviteCode)}`, {}, token)
      .then(setPreview)
      .catch((err) => {
        console.error(err);
        onToast('error', err instanceof Error ? err.message : 'Не удалось загрузить приглашение');
      })
      .finally(() => setLoading(false));
  }, [inviteCode, onToast, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoining(true);
    const form = new FormData(event.currentTarget);
    try {
      const joinedRoom = await request<Room>(`/rooms/join/${encodeURIComponent(inviteCode)}`, {
        method: 'POST',
        body: JSON.stringify({
          wishlist: String(form.get('wishlist') ?? '').trim(),
          wishlistLinks: String(form.get('wishlistLinks') ?? '').trim()
        })
      }, token);
      onToast('success', 'Вы присоединились к комнате');
      onJoined(joinedRoom);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось присоединиться';
      console.error(err);
      onToast('error', message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="page join-page" ref={pageRef}>
      {loading ? (
        <SkeletonCards count={1} />
      ) : (
        <Card className="join-card">
          <div className="join-icon"><Ticket size={30} /></div>
          <span className="eyebrow">Приглашение</span>
          <h1>{preview ? `Присоединиться к "${preview.name}"` : 'Приглашение в комнату'}</h1>
          {!preview && <p>Приглашение недействительно или комната больше недоступна.</p>}
          <p>{preview?.description || 'Добавьте пожелания, чтобы ваш Тайный Санта увидел их после жеребьевки.'}</p>
          {preview && preview.status === 'OPEN' ? (
            <form className="stack-form" onSubmit={submit}>
              <TextAreaField label="Пожелания" name="wishlist" maxLength={1000} placeholder="Что вы хотели бы получить?" />
              <TextAreaField label="Ссылки" name="wishlistLinks" maxLength={1500} placeholder="Одна ссылка на строку" />
              <Button type="submit" loading={joining}>Войти в комнату</Button>
            </form>
          ) : (
            <Button type="button" variant="secondary" onClick={onCancel}>На главную</Button>
          )}
        </Card>
      )}
    </div>
  );
}
