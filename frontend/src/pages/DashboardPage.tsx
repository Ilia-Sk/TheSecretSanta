import { CalendarDays, Plus } from 'lucide-react';
import { useMemo, useRef } from 'react';
import type { Profile, Room } from '../api';
import { RoomCard } from '../components/RoomCard';
import { Button, EmptyState, SkeletonCards } from '../components/ui';
import { PremiumGiftObject } from '../components/visual';
import { useRevealOnView } from '../hooks/useRevealOnView';
import { formatBudget, formatCountdown, formatDate } from '../utils';

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
  const pageRef = useRef<HTMLDivElement>(null);
  useRevealOnView(pageRef);

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

  return (
    <div className="page page-dashboard" ref={pageRef}>
      <section className="dashboard-hero reference-dashboard-hero">
        <div className="dashboard-hero-copy" data-reveal>
          <span className="eyebrow">{today}</span>
          <h1>
            Добрый день,
            <br />
            <em>{firstName}</em>
          </h1>
          <p>
            {nextRoom
              ? `${formatCountdown(nextRoom.celebrationDate)}. Ближайшая комната: ${nextRoom.name}.`
              : 'Создайте первую комнату, пригласите участников и сохраните момент раскрытия до самого праздника.'}
          </p>
        </div>

        {nextRoom ? (
          <button
            type="button"
            className="upcoming-room"
            onClick={() => onOpenRoom(nextRoom.id)}
            data-reveal
          >
            <div>
              <span className="eyebrow">Ближайшее событие</span>
              <strong>{formatDate(nextRoom.celebrationDate)}</strong>
              <span className="upcoming-title">{nextRoom.name}</span>
              <span className="upcoming-meta">
                {nextRoom.participants.length} участников · {formatBudget(nextRoom.giftBudget)}
              </span>
            </div>
            <PremiumGiftObject className="dashboard-gift" interactive={false} />
          </button>
        ) : (
          <div className="upcoming-room empty-upcoming" data-reveal>
            <div>
              <span className="eyebrow">Ближайшее событие</span>
              <strong>Пока не выбрано</strong>
              <span className="upcoming-meta">Дата появится после создания комнаты</span>
            </div>
            <PremiumGiftObject className="dashboard-gift" interactive={false} />
          </div>
        )}
      </section>

      <section className="rooms-section">
        <div className="section-heading rooms-heading" data-reveal>
          <div>
            <span className="eyebrow">Коллекция</span>
            <h2>Мои комнаты</h2>
          </div>
          <Button type="button" variant="primary" onClick={onCreateRoom}>
            <Plus size={16} />
            Создать комнату
          </Button>
        </div>

        {loading ? (
          <SkeletonCards />
        ) : rooms.length === 0 ? (
          <EmptyState
            title="Создайте первую комнату Тайного Санты"
            text="Добавьте дату, бюджет и пожелания. После этого можно отправить приглашение друзьям или коллегам."
            action={<Button type="button" variant="primary" onClick={onCreateRoom}><Plus size={18} />Создать первую комнату</Button>}
          />
        ) : (
          <div className="room-cards">
            {rooms.map((room, index) => <RoomCard room={room} index={index} key={room.id} onOpen={onOpenRoom} />)}
            <button type="button" className="create-room-card reference-create-card" onClick={onCreateRoom} data-reveal>
              <span><Plus size={22} /></span>
              <strong>Новая комната</strong>
              <small>Дата, бюджет, участники и первое приглашение</small>
            </button>
          </div>
        )}
      </section>

      <div className="dashboard-footnote" data-reveal>
        <CalendarDays size={15} />
        <span>Все даты, бюджеты и статусы загружены из текущего API.</span>
      </div>
    </div>
  );
}
