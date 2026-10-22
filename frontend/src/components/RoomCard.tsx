import { ChevronRight } from 'lucide-react';
import type { Room } from '../api';
import { formatBudget, formatDate, statusLabels } from '../utils';
import { Avatar, Card } from './ui';
import { CubeGift, toneForStatus } from './visual';

export function StatusBadge({ status }: { status: Room['status'] }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <i aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
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
  const shown = room.participants.slice(0, 4);
  const rest = room.participants.length - shown.length;

  return (
    <Card className={`room-card tone-${toneForStatus(room.status)}`} delay={Math.min(index, 6) * 0.06} layoutId={`room-card-${room.id}`}>
      <div className="room-card-top">
        <StatusBadge status={room.status} />
        <CubeGift size={54} tone={toneForStatus(room.status)} open={room.status === 'DRAWN'} />
      </div>
      <div className="room-card-copy">
        <span className="room-card-date">{formatDate(room.celebrationDate)}</span>
        <h3>{room.name}</h3>
        <p>{room.description || 'Описание пока не добавлено.'}</p>
      </div>
      <div className="room-card-foot">
        <div className="avatar-stack" aria-label={`${room.participants.length} участников`}>
          {shown.map((participant) => (
            <Avatar key={participant.participantId} name={participant.displayName} avatarUrl={participant.avatarUrl} size="xs" />
          ))}
          {rest > 0 && <span className="avatar avatar-xs avatar-more">+{rest}</span>}
        </div>
        <span className="room-card-budget">{formatBudget(room.giftBudget)}</span>
      </div>
      <button type="button" className="room-card-open stretched" onClick={() => onOpen(room.id)}>
        Открыть комнату <ChevronRight size={16} />
      </button>
    </Card>
  );
}
