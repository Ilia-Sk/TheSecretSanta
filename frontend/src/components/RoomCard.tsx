import { CalendarDays, Gift, Users } from 'lucide-react';
import type { Room } from '../api';
import { formatBudget, formatDate, statusLabels } from '../utils';
import { Button, Card } from './ui';
import { MiniGiftMark } from './visual';

export function StatusBadge({ status }: { status: Room['status'] }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

export function RoomCard({
  room,
  index,
  onOpen
}: {
  room: Room;
  index: number;
  onOpen: (roomId: number) => void;
}) {
  return (
    <Card className="room-card" style={{ '--stagger': `${index * 70}ms` } as React.CSSProperties}>
      <div className="room-card-head">
        <MiniGiftMark />
        <StatusBadge status={room.status} />
      </div>
      <div className="room-card-copy">
        <h3>{room.name}</h3>
        <p>{room.description || 'Описание пока не добавлено.'}</p>
      </div>
      <div className="room-facts" aria-label="Детали комнаты">
        <span><CalendarDays size={16} />{formatDate(room.celebrationDate)}</span>
        <span><Gift size={16} />{formatBudget(room.giftBudget)}</span>
        <span><Users size={16} />{room.participants.length} участников</span>
      </div>
      <Button type="button" variant="secondary" onClick={() => onOpen(room.id)}>
        Открыть комнату
      </Button>
    </Card>
  );
}
