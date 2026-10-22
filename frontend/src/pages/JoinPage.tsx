import { FormEvent, useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { BorderBeam } from '../components/magicui';
import { CubeGift } from '../components/visual';
import type { InvitePreview, Room } from '../api';
import { request } from '../api';
import { Button, Card, SkeletonCards, TextAreaField } from '../components/ui';

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

  const tx = useMotionValue(0.5);
  const ty = useMotionValue(0.5);
  const rotateY = useSpring(useTransform(tx, [0, 1], [-16, 16]), { stiffness: 150, damping: 18 });
  const rotateX = useSpring(useTransform(ty, [0, 1], [12, -12]), { stiffness: 150, damping: 18 });
  const holoX = useTransform(tx, (value) => `${value * 100}%`);
  const holoY = useTransform(ty, (value) => `${value * 100}%`);

  return (
    <div className="page join-page">
      {loading ? (
        <SkeletonCards count={1} />
      ) : (
        <div className="join-layout">
          <div
            className="join-ticket-stage"
            onPointerMove={(event) => {
              if (event.pointerType !== 'mouse') return;
              const rect = event.currentTarget.getBoundingClientRect();
              tx.set((event.clientX - rect.left) / rect.width);
              ty.set((event.clientY - rect.top) / rect.height);
            }}
            onPointerLeave={() => {
              tx.set(0.5);
              ty.set(0.5);
            }}
          >
            <motion.div
              className="join-ticket"
              style={{ rotateX, rotateY, transformPerspective: 1200, '--hx': holoX, '--hy': holoY } as never}
              initial={{ opacity: 0, y: 60, rotateX: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 110, damping: 16 }}
            >
              <BorderBeam size={120} duration={7} colorFrom="#fff4d6" colorTo="#f5c66b" />
              <span className="join-ticket-holo" aria-hidden="true" />
              <div className="join-ticket-top">
                <span className="eyebrow"><Ticket size={15} /> Приглашение</span>
                <CubeGift size={58} />
              </div>
              <h1>{preview ? preview.name : 'Приглашение в комнату'}</h1>
              <p>{preview?.description || 'Добавьте пожелания, чтобы ваш Тайный Санта увидел их после жеребьевки.'}</p>
              <span className="join-ticket-code">/join/{inviteCode}</span>
            </motion.div>
          </div>

          <Card className="join-card" tilt={false} delay={0.15}>
            <span className="eyebrow">Присоединение</span>
            <h2>{preview ? `Присоединиться к "${preview.name}"` : 'Приглашение в комнату'}</h2>
            {!preview && <p>Приглашение недействительно или комната больше недоступна.</p>}
            {preview && preview.status === 'OPEN' ? (
              <form className="stack-form" onSubmit={submit}>
                <TextAreaField label="Пожелания" name="wishlist" maxLength={1000} placeholder="Что вы хотели бы получить?" />
                <TextAreaField label="Ссылки" name="wishlistLinks" maxLength={1500} placeholder="Одна ссылка на строку" />
                <div className="form-actions">
                  <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>
                  <Button type="submit" loading={joining}>Войти в комнату</Button>
                </div>
              </form>
            ) : (
              <>
                {preview && <p>Комната больше не принимает новых участников.</p>}
                <Button type="button" variant="secondary" onClick={onCancel}>На главную</Button>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
