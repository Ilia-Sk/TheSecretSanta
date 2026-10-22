import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useRef } from 'react';
import type { Profile, Room } from '../api';
import { RoomCard } from '../components/RoomCard';
import { BlurFade, NumberTicker } from '../components/magicui';
import { Button, EmptyState, SectionTitle, SkeletonCards } from '../components/ui';
import { BackgroundPaths, InteractiveHoverButton } from '../components/twentyfirst';
import { Gift3D, GiftPile, toneForStatus } from '../components/visual';
import { useHeroDepth } from '../hooks/motion';
import { formatBudget, formatCountdown, formatDate } from '../utils';

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / 86_400_000);
}

function pluralDays(days: number) {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

export function DashboardPage({
  profile,
  rooms,
  loading,
  onCreateRoom,
  onOpenRoom
}: {
  profile: Profile;
  rooms: Room[];
  loading: boolean;
  onCreateRoom: () => void;
  onOpenRoom: (roomId: number) => void;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const giftDepth = useHeroDepth(heroRef);

  const nextRoom = useMemo(() => {
    return rooms
      .filter((room) => room.celebrationDate)
      .sort((a, b) => String(a.celebrationDate).localeCompare(String(b.celebrationDate)))[0] ?? null;
  }, [rooms]);

  const firstName = profile.displayName.trim().split(/\s+/)[0] || profile.displayName;
  const today = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date());
  const days = daysUntil(nextRoom?.celebrationDate ?? null);

  return (
    <div className="page page-dashboard">
      <BlurFade as="header" className="store-header">
        <h1>
          Комнаты.
          <span> Добрый день, {firstName}. Подарки ждут.</span>
        </h1>
        <div className="store-header-aside">
          <span className="eyebrow">{today}</span>
        </div>
      </BlurFade>

      <motion.section
        className="spotlight dark-section"
        ref={heroRef}
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="hero-aurora" aria-hidden="true" />
        <BackgroundPaths className="spotlight-paths" count={30} angle={-14} speed={0.6} />
        <div className="spotlight-copy">
          <span className="eyebrow eyebrow-warm">Ближайшее событие</span>
          {nextRoom ? (
            <>
              <h2>{nextRoom.name}</h2>
              {days !== null && days >= 0 ? (
                <div className="countdown">
                  <strong><NumberTicker value={days} startValue={days > 30 ? days + 40 : 0} /></strong>
                  <span>{days === 0 ? 'Праздник сегодня' : `${pluralDays(days)} до праздника`}</span>
                </div>
              ) : (
                <p className="spotlight-sub">{formatCountdown(nextRoom.celebrationDate)}</p>
              )}
              <p className="spotlight-meta">
                {formatDate(nextRoom.celebrationDate)} · {nextRoom.participants.length} участников · {formatBudget(nextRoom.giftBudget)}
              </p>
              <div className="spotlight-actions">
                <InteractiveHoverButton type="button" tone="dark" onClick={() => onOpenRoom(nextRoom.id)}>Открыть комнату</InteractiveHoverButton>
              </div>
            </>
          ) : (
            <>
              <h2>Пока не выбрано</h2>
              <p className="spotlight-sub">
                Создайте первую комнату, пригласите участников и сохраните момент раскрытия до самого праздника.
              </p>
              <div className="spotlight-actions">
                <Button type="button" variant="metal" onClick={onCreateRoom}><Plus size={17} />Создать комнату</Button>
              </div>
            </>
          )}
        </div>
        <motion.div className="spotlight-visual" style={giftDepth}>
          <Gift3D
            className="spotlight-gift"
            tone={nextRoom ? toneForStatus(nextRoom.status) : 'red'}
            open={nextRoom?.status === 'DRAWN'}
          />
        </motion.div>
      </motion.section>

      <section className="rooms-section">
        <SectionTitle eyebrow="Коллекция" title="Мои комнаты." />

        {loading ? (
          <SkeletonCards />
        ) : rooms.length === 0 ? (
          <>
          <GiftPile className="empty-pile" count={10} width={16} hint="Поиграйте с подарками, пока комнат нет" />
          <EmptyState
            title="Создайте первую комнату Тайного Санты"
            text="Добавьте дату, бюджет и пожелания. После этого можно отправить приглашение друзьям или коллегам."
            action={<Button type="button" variant="accent" onClick={onCreateRoom}><Plus size={18} />Создать первую комнату</Button>}
          />
          </>
        ) : (
          <div className="room-cards">
            {rooms.map((room, index) => <RoomCard room={room} index={index} key={room.id} onOpen={onOpenRoom} />)}
            <motion.button
              type="button"
              className="create-room-card"
              onClick={onCreateRoom}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
              <motion.span className="create-plus" whileHover={{ rotate: 90, scale: 1.08 }}><Plus size={26} /></motion.span>
              <strong>Новая комната</strong>
              <small>Дата, бюджет, участники и первое приглашение</small>
            </motion.button>
          </div>
        )}
      </section>
    </div>
  );
}
