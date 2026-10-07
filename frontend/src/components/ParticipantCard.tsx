import { Check, Crown, Gift, LockKeyhole } from 'lucide-react';
import type { Participant } from '../api';
import { Avatar } from './ui';

export function ParticipantCard({
  participant,
  currentUserId
}: {
  participant: Participant;
  currentUserId: number;
}) {
  const isCurrentUser = participant.userId === currentUserId;
  const hasWishlist = Boolean(participant.wishlist?.trim() || participant.wishlistLinks?.trim());

  return (
    <article className="participant-card">
      <Avatar name={participant.displayName} avatarUrl={participant.avatarUrl} />
      <div>
        <strong>{participant.displayName}</strong>
        <span>{participant.owner ? <><Crown size={14} /> Владелец комнаты</> : <><Gift size={14} /> Участник</>}</span>
      </div>
      <em className={hasWishlist ? 'complete' : 'muted'}>
        {isCurrentUser
          ? hasWishlist
            ? <><Check size={13} /> Ваши пожелания заполнены</>
            : <><Gift size={13} /> Ваши пожелания не заполнены</>
          : <><LockKeyhole size={13} /> Пожелания скрыты</>}
      </em>
    </article>
  );
}
