import { CalendarDays, Gift, Moon, Plus, Sparkles, Users } from 'lucide-react';
import { useRef } from 'react';
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

  const nextRoom = rooms
    .filter((room) => room.celebrationDate)
    .sort((a, b) => String(a.celebrationDate).localeCompare(String(b.celebrationDate)))[0];
  const participantsCount = rooms.reduce((sum, room) => sum + room.participants.length, 0);

  return (
    <div className="page page-dashboard" ref={pageRef}>
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy" data-reveal>
          <span className="eyebrow"><Moon size={15} /> Ваш праздничный сезон</span>
          <h1>Здравствуйте, {profile.displayName}</h1>
          <p>
            {nextRoom
              ? `Ближайшая комната: ${nextRoom.name}. ${formatCountdown(nextRoom.celebrationDate)}.`
              : 'Создайте первую комнату, пригласите участников и сохраните момент раскрытия до самого праздника.'}
          </p>
          <div className="hero-summary">
            <span><Gift size={17} />{rooms.length} комнат</span>
            <span><Users size={17} />{participantsCount} участников</span>
            <span><CalendarDays size={17} />{nextRoom ? formatDate(nextRoom.celebrationDate) : 'Нет даты'}</span>
          </div>
          <Button type="button" variant="accent" onClick={onCreateRoom}>
            <Plus size={18} />
            Создать комнату
          </Button>
        </div>

        <div className="dashboard-hero-visual" data-reveal>
          <PremiumGiftObject className="dashboard-gift" />
          <div className="celebration-panel">
            <span>Ближайший обмен</span>
            <strong>{nextRoom ? nextRoom.name : 'Пока не выбран'}</strong>
            <small>{nextRoom ? `${formatBudget(nextRoom.giftBudget)} · ${formatDate(nextRoom.celebrationDate)}` : 'Добавьте дату и бюджет при создании комнаты'}</small>
          </div>
        </div>
      </section>

      <section className="stats-grid narrative-strip" aria-label="Сводка" data-reveal>
        <div className="stat-card">
          <Users size={20} />
          <strong>{participantsCount}</strong>
          <span>участников во всех комнатах</span>
        </div>
        <div className="stat-card">
          <Gift size={20} />
          <strong>{rooms.filter((room) => room.status === 'DRAWN').length}</strong>
          <span>проведенных жеребьевок</span>
        </div>
        <div className="stat-card">
          <Sparkles size={20} />
          <strong>{rooms.filter((room) => room.status === 'OPEN').length}</strong>
          <span>комнат ждут настройки</span>
        </div>
      </section>

      {loading ? (
        <SkeletonCards />
      ) : rooms.length === 0 ? (
        <EmptyState
          title="Создайте первую комнату Тайного Санты"
          text="Добавьте дату, бюджет и пожелания. После этого можно отправить приглашение друзьям или коллегам."
          action={<Button type="button" variant="accent" onClick={onCreateRoom}><Plus size={18} />Создать первую комнату</Button>}
        />
      ) : (
        <section className="rooms-section">
          <div className="section-heading" data-reveal>
            <div>
              <span className="eyebrow">Комнаты</span>
              <h2>Ваши комнаты</h2>
              <p>Каждая комната хранит участников, пожелания, ограничения и статус праздничного обмена.</p>
            </div>
          </div>
          <div className="room-cards">
            <button type="button" className="create-room-card" onClick={onCreateRoom} data-reveal>
              <span><Plus size={22} /></span>
              <strong>Создать новую комнату</strong>
              <small>Дата, бюджет, участники и первое приглашение</small>
            </button>
            {rooms.map((room, index) => <RoomCard room={room} index={index} key={room.id} onOpen={onOpenRoom} />)}
          </div>
        </section>
      )}
    </div>
  );
}
