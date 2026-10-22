import { Check, Crown, Gift, LockKeyhole } from 'lucide-react';
import type { Participant } from '../api';
import { Avatar, Card } from './ui';

export function ParticipantCard({
  participant,
  currentUserId,
  index = 0
}: {
  participant: Participant;
  currentUserId: number;
  index?: number;
}) {
  const isCurrentUser = participant.userId === currentUserId;
  const hasWishlist = Boolean(participant.wishlist?.trim() || participant.wishlistLinks?.trim());

  return (
    <Card className={`participant-card ${isCurrentUser ? 'is-me' : ''}`} delay={Math.min(index, 8) * 0.05}>
      <div className="participant-avatar">
        <Avatar name={participant.displayName} avatarUrl={participant.avatarUrl} size="lg" />
        {participant.owner && <span className="owner-crown" title="Владелец комнаты"><Crown size={12} /></span>}
      </div>
      <strong>{participant.displayName}{isCurrentUser && <small> · вы</small>}</strong>
      <span className="participant-role">
        {participant.owner ? <><Crown size={13} /> Владелец комнаты</> : <><Gift size={13} /> Участник</>}
      </span>
      <em className={isCurrentUser ? (hasWishlist ? 'pill pill-ok' : 'pill pill-warn') : 'pill'}>
        {isCurrentUser
          ? hasWishlist
            ? <><Check size={12} /> Ваши пожелания заполнены</>
            : <><Gift size={12} /> Ваши пожелания не заполнены</>
          : <><LockKeyhole size={12} /> Пожелания скрыты</>}
      </em>
    </Card>
  );
}
