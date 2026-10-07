import { ArrowUpRight } from 'lucide-react';
import type { Room } from '../api';
import { formatBudget, formatDate, statusLabels } from '../utils';
import { Card } from './ui';

export function StatusBadge({ status }: { status: Room['status'] }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

function roomTone(status: Room['status']) {
  if (status === 'DRAWN') return 'forest';
  if (status === 'CLOSED') return 'ink';
  return 'wine';
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
    <Card className={`room-card invitation-card tone-${roomTone(room.status)}`} style={{ '--stagger': `${index * 70}ms` } as React.CSSProperties}>
      <span className="invitation-border" aria-hidden="true" />
      <span className="invitation-glow" aria-hidden="true" />
      <div className="room-card-head">
        <StatusBadge status={room.status} />
        <ArrowUpRight size={18} className="room-card-arrow" />
      </div>
      <div className="room-card-copy">
        <span className="eyebrow">Приглашение</span>
        <h3>{room.name}</h3>
        <p>{room.description || 'Описание пока не добавлено.'}</p>
        <span className="room-card-date">{formatDate(room.celebrationDate)}</span>
      </div>
      <div className="room-facts" aria-label="Детали комнаты">
        <span>{room.participants.length} участников</span>
        <span>Бюджет {formatBudget(room.giftBudget)}</span>
      </div>
      <button type="button" className="room-card-open" onClick={() => onOpen(room.id)}>
        Открыть комнату
      </button>
    </Card>
  );
}
