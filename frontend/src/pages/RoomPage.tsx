import {
  ArrowRight,
  Ban,
  CalendarDays,
  Check,
  Copy,
  Gift,
  Link as LinkIcon,
  ListChecks,
  ScrollText,
  Settings,
  Shuffle,
  Trash2,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MyAssignment, Room } from '../api';
import { request } from '../api';
import { ParticipantCard } from '../components/ParticipantCard';
import { StatusBadge } from '../components/RoomCard';
import { Avatar, Button, Card, ConfirmDialog, Field, IconButton, Modal, TextAreaField } from '../components/ui';
import { PremiumGiftObject } from '../components/visual';
import { useRevealOnView } from '../hooks/useRevealOnView';
import { formatBudget, formatDate, safeExternalHref, splitLinks, statusHints, todayDateInputValue } from '../utils';

type ToastFn = (type: 'success' | 'error' | 'info', message: string) => void;
type RoomTab = 'overview' | 'participants' | 'wishlist' | 'restrictions' | 'settings';
type DrawPhase = 'idle' | 'requesting' | 'opening' | 'complete';

const tabs: Array<{ id: RoomTab; label: string; icon: typeof Gift }> = [
  { id: 'overview', label: 'Обзор', icon: ListChecks },
  { id: 'participants', label: 'Участники', icon: Users },
  { id: 'wishlist', label: 'Пожелания', icon: WalletCards },
  { id: 'restrictions', label: 'Ограничения', icon: Ban },
  { id: 'settings', label: 'Настройки', icon: Settings }
];

export function RoomPage({
  room,
  token,
  currentUserId,
  assignment,
  onChanged,
  onDeleted,
  onToast
}: {
  room: Room;
  token: string;
  currentUserId: number;
  assignment: MyAssignment | null;
  onChanged: (preferredRoomId?: number) => Promise<void>;
  onDeleted: (roomId: number) => void;
  onToast: ToastFn;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  useRevealOnView(pageRef);
  const [activeTab, setActiveTab] = useState<RoomTab>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [drawCelebration, setDrawCelebration] = useState(false);
  const [drawPhase, setDrawPhase] = useState<DrawPhase>('idle');
  const drawFocus = drawPhase !== 'idle';
  const drawTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (drawTimerRef.current !== null) {
      window.clearTimeout(drawTimerRef.current);
      drawTimerRef.current = null;
    }
    setActiveTab('overview');
    setShowInviteLink(false);
    setCopied(false);
    setShowAssignment(false);
    setDrawCelebration(false);
    setDrawPhase('idle');
  }, [room.id]);

  useEffect(() => () => {
    if (drawTimerRef.current !== null) {
      window.clearTimeout(drawTimerRef.current);
    }
  }, []);

  const currentParticipant = useMemo(
    () => room.participants.find((participant) => participant.userId === currentUserId) ?? null,
    [room.participants, currentUserId]
  );
  const isOwner = room.owner || room.ownerId === currentUserId || currentParticipant?.owner === true;
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => tab.id !== 'restrictions' || isOwner),
    [isOwner]
  );

  const inviteLink = `${window.location.origin}/join/${encodeURIComponent(room.inviteCode)}`;
  const wishlistLinks = splitLinks(currentParticipant?.wishlistLinks ?? null);

  useEffect(() => {
    if (!isOwner && activeTab === 'restrictions') {
      setActiveTab('overview');
    }
  }, [activeTab, isOwner]);

  async function run(label: string, action: () => Promise<void>): Promise<boolean> {
    setBusy(label);
    try {
      await action();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось выполнить запрос';
      console.error(err);
      onToast('error', message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      onToast('success', 'Приглашение скопировано');
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error(err);
      onToast('error', 'Не удалось скопировать приглашение');
    }
  }

  async function updateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOwner) {
      onToast('error', 'Редактировать комнату может только владелец.');
      setActiveTab('overview');
      return;
    }
    const form = new FormData(event.currentTarget);
    await run('room', async () => {
      await request<Room>(`/rooms/${room.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          description: String(form.get('description') ?? '').trim(),
          celebrationDate: form.get('celebrationDate') ? String(form.get('celebrationDate')) : null,
          giftBudget: form.get('giftBudget') ? Number(form.get('giftBudget')) : null
        })
      }, token);
      onToast('success', 'Комната обновлена');
      await onChanged(room.id);
    });
  }

  async function updateWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run('wishlist', async () => {
      await request<Room>(`/rooms/${room.id}/wishlist`, {
        method: 'PUT',
        body: JSON.stringify({
          wishlist: String(form.get('wishlist') ?? '').trim(),
          wishlistLinks: String(form.get('wishlistLinks') ?? '').trim()
        })
      }, token);
      onToast('success', 'Пожелания обновлены');
      await onChanged(room.id);
    });
  }

  async function addRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOwner) {
      onToast('error', 'Ограничения доступны только владельцу комнаты.');
      setActiveTab('overview');
      return;
    }
    const form = new FormData(event.currentTarget);
    await run('restriction', async () => {
      await request<Room>(`/rooms/${room.id}/restrictions`, {
        method: 'POST',
        body: JSON.stringify({
          giverParticipantId: Number(form.get('giverParticipantId')),
          receiverParticipantId: Number(form.get('receiverParticipantId'))
        })
      }, token);
      onToast('success', 'Ограничение добавлено');
      await onChanged(room.id);
    });
  }

  async function deleteRestriction(restrictionId: number) {
    if (!isOwner) {
      onToast('error', 'Ограничения доступны только владельцу комнаты.');
      setActiveTab('overview');
      return;
    }
    await run(`restriction-${restrictionId}`, async () => {
      await request<Room>(`/rooms/${room.id}/restrictions/${restrictionId}`, { method: 'DELETE' }, token);
      onToast('success', 'Ограничение удалено');
      await onChanged(room.id);
    });
  }

  async function drawRoom() {
    if (!isOwner) {
      onToast('error', 'Провести жеребьевку может только владелец комнаты.');
      setActiveTab('overview');
      return;
    }
    setConfirmDraw(false);
    const startedAt = performance.now();
    setDrawPhase('requesting');
    const ok = await run('draw', async () => {
      await request<Room>(`/rooms/${room.id}/draw`, { method: 'POST' }, token);
      await onChanged(room.id);
    });

    if (!ok) {
      setDrawPhase('idle');
      return;
    }

    onToast('success', 'Жеребьевка завершена');
    const remainingAnticipation = Math.max(0, 700 - (performance.now() - startedAt));
    drawTimerRef.current = window.setTimeout(() => {
      drawTimerRef.current = null;
      setDrawPhase('opening');
    }, remainingAnticipation);
  }

  const finishDrawAnimation = useCallback(() => {
    setDrawPhase('complete');
    setDrawCelebration(true);
    setShowAssignment(true);
    window.setTimeout(() => setDrawPhase('idle'), 700);
  }, []);

  async function deleteRoom() {
    if (!isOwner) {
      onToast('error', 'Удалить комнату может только владелец.');
      setActiveTab('overview');
      return;
    }
    await run('delete', async () => {
      await request<void>(`/rooms/${room.id}`, { method: 'DELETE' }, token);
      onToast('success', 'Комната удалена');
      onDeleted(room.id);
    });
    setConfirmDelete(false);
  }

  return (
    <div className="page room-page" ref={pageRef}>
      <section className="room-hero">
        <div className="room-hero-copy" data-reveal>
          <StatusBadge status={room.status} />
          <h1>{room.name}</h1>
          <p>{room.description || statusHints[room.status]}</p>
          <div className="hero-meta">
            <span><CalendarDays size={16} />{formatDate(room.celebrationDate)}</span>
            <span><Gift size={16} />{formatBudget(room.giftBudget)}</span>
            <span><Users size={16} />{room.participants.length} участников</span>
          </div>
          <div className="room-hero-actions">
            {isOwner && room.status === 'OPEN' && (
              <Button type="button" variant="accent" onClick={() => setConfirmDraw(true)}>
                <Shuffle size={18} />
                Провести жеребьевку
              </Button>
            )}
            {room.status === 'DRAWN' && assignment && (
              <Button type="button" variant="accent" onClick={() => setShowAssignment(true)}>
                <Gift size={18} />
                Открыть подарок
              </Button>
            )}
          </div>
        </div>
        <div className="room-hero-visual" data-reveal>
          <PremiumGiftObject className="room-gift" open={room.status === 'DRAWN'} />
        </div>
      </section>

      <nav className="room-tabs" aria-label="Разделы комнаты" role="tablist" data-reveal>
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              id={`room-tab-trigger-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`room-tab-panel-${tab.id}`}
              className={activeTab === tab.id ? 'room-tab active' : 'room-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section
        className="tab-panel"
        id={`room-tab-panel-${activeTab}`}
        key={`${room.id}-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`room-tab-trigger-${activeTab}`}
      >
        {activeTab === 'overview' && (
          <OverviewSection
            room={room}
            assignment={assignment}
            inviteLink={inviteLink}
            copied={copied}
            showInviteLink={showInviteLink}
            onCopyInvite={copyInvite}
            onToggleInvite={() => setShowInviteLink((value) => !value)}
            onOpenAssignment={() => setShowAssignment(true)}
            isOwner={isOwner}
          />
        )}

        {activeTab === 'participants' && (
          <div className="participants-section">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Состав комнаты</span>
                <h2>Участники</h2>
                <p>Карточки показывают владельца комнаты и заполненность пожеланий.</p>
              </div>
            </div>
            <div className="participants-grid">
              {room.participants.map((participant) => (
                <ParticipantCard
                  participant={participant}
                  currentUserId={currentUserId}
                  key={participant.participantId}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'wishlist' && (
          <WishlistSection
            currentParticipant={currentParticipant}
            roomStatus={room.status}
            links={wishlistLinks}
            busy={busy}
            onSubmit={updateWishlist}
          />
        )}

        {isOwner && activeTab === 'restrictions' && (
          <RestrictionsSection
            room={room}
            isOwner={isOwner}
            busy={busy}
            onAdd={addRestriction}
            onDelete={deleteRestriction}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsSection
            room={room}
            isOwner={isOwner}
            busy={busy}
            onUpdateRoom={updateRoom}
            onDeleteRoom={() => setConfirmDelete(true)}
          />
        )}
      </section>

      {drawFocus && (
        <div className={`draw-focus-overlay draw-phase-${drawPhase}`} role="status" aria-live="polite">
          <div className="draw-focus-panel">
            <PremiumGiftObject
              className="draw-gift"
              interactive={false}
              revealState={drawPhase === 'opening' ? 'opening' : drawPhase === 'complete' ? 'open' : 'closed'}
              onRevealComplete={finishDrawAnimation}
            />
            <span className="eyebrow">Жеребьевка</span>
            <h2>{drawPhase === 'requesting' ? 'Проводим жеребьевку' : drawPhase === 'opening' ? 'Открываем подарок' : 'Получатели определены'}</h2>
            <p>{drawPhase === 'requesting'
              ? 'Система учитывает участников и ограничения комнаты.'
              : drawPhase === 'opening'
                ? 'Готовим ваше назначение.'
                : 'Каждый участник увидит только свое назначение.'}</p>
          </div>
        </div>
      )}

      {confirmDraw && (
        <ConfirmDialog
          title="Провести жеребьевку?"
          description="После запуска участники увидят только своих получателей. Проверьте ограничения и список участников перед подтверждением."
          confirmText="Провести"
          loading={busy === 'draw'}
          onCancel={() => setConfirmDraw(false)}
          onConfirm={drawRoom}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Удалить комнату?"
          description={`Комната "${room.name}" будет удалена без возможности восстановления.`}
          confirmText="Удалить"
          danger
          loading={busy === 'delete'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={deleteRoom}
        />
      )}

      {showAssignment && assignment && (
        <AssignmentReveal
          assignment={assignment}
          fresh={drawCelebration}
          onClose={() => {
            setShowAssignment(false);
            setDrawCelebration(false);
          }}
        />
      )}
    </div>
  );
}

function OverviewSection({
  room,
  assignment,
  inviteLink,
  copied,
  showInviteLink,
  onCopyInvite,
  onToggleInvite,
  onOpenAssignment,
  isOwner
}: {
  room: Room;
  assignment: MyAssignment | null;
  inviteLink: string;
  copied: boolean;
  showInviteLink: boolean;
  onCopyInvite: () => void;
  onToggleInvite: () => void;
  onOpenAssignment: () => void;
  isOwner: boolean;
}) {
  return (
    <div className="overview-grid">
      <Card className="overview-card">
        <span className="eyebrow">Состояние</span>
        <h2>{statusHints[room.status]}</h2>
        <div className="overview-facts">
          <div><span>Дата</span><strong>{formatDate(room.celebrationDate)}</strong></div>
          <div><span>Бюджет</span><strong>{formatBudget(room.giftBudget)}</strong></div>
          <div><span>Участники</span><strong>{room.participants.length}</strong></div>
          {isOwner && <div><span>Ограничения</span><strong>{room.restrictions.length}</strong></div>}
        </div>
      </Card>

      <Card className="invite-card">
        <div className="section-heading compact">
          <div>
            <h2><LinkIcon size={20} /> Приглашение</h2>
            <p>Скопируйте ссылку и отправьте ее участникам.</p>
          </div>
        </div>
        <div className="invite-actions">
          <Button type="button" variant={copied ? 'secondary' : 'primary'} onClick={onCopyInvite}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? 'Скопировано' : 'Скопировать приглашение'}
          </Button>
          <button className="text-link" type="button" onClick={onToggleInvite}>
            {showInviteLink ? 'Скрыть ссылку' : 'Показать ссылку'}
          </button>
        </div>
        {showInviteLink && <a href={inviteLink} className="invite-link">{inviteLink}</a>}
      </Card>

      <Card className="assignment-card">
        <span className="eyebrow">Получатель</span>
        {room.status === 'DRAWN' && assignment ? (
          <>
            <h2>Ваш получатель определен</h2>
            <p>Получатель скрыт до момента открытия подарка.</p>
            <Button type="button" variant="accent" onClick={onOpenAssignment}>
              <Gift size={17} />
              Открыть подарок
            </Button>
          </>
        ) : (
          <>
            <h2>Назначение пока закрыто</h2>
            <p>После жеребьевки здесь появится имя человека, которому вы дарите подарок.</p>
          </>
        )}
      </Card>
    </div>
  );
}

function WishlistSection({
  currentParticipant,
  roomStatus,
  links,
  busy,
  onSubmit
}: {
  currentParticipant: Room['participants'][number] | null;
  roomStatus: Room['status'];
  links: string[];
  busy: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!currentParticipant) {
    return (
      <Card className="wishlist-board">
        <h2>Пожелания недоступны</h2>
        <p>Ваш участник в этой комнате не найден.</p>
      </Card>
    );
  }

  return (
    <div className="wishlist-layout">
      <Card className="wishlist-board">
        <span className="eyebrow">Ваш список подарков</span>
        <h2>{currentParticipant.wishlist || 'Пожелания пока не заполнены'}</h2>
        {links.length > 0 ? (
          <div className="wishlist-links">
            {links.map((link) => {
              const href = safeExternalHref(link);
              return href
                ? <a href={href} target="_blank" rel="noreferrer" key={link}>{link}</a>
                : <span key={link}>{link}</span>;
            })}
          </div>
        ) : (
          <p>Ссылки появятся здесь после сохранения.</p>
        )}
      </Card>

      {roomStatus === 'OPEN' ? (
        <Card className="wishlist-editor">
          <div className="section-heading compact">
            <div>
              <h2><WalletCards size={20} /> Пожелания</h2>
              <p>Ваш Тайный Санта увидит их после жеребьевки.</p>
            </div>
          </div>
          <form
            className="stack-form"
            onSubmit={onSubmit}
            key={`${currentParticipant.participantId}-${currentParticipant.wishlist ?? ''}-${currentParticipant.wishlistLinks ?? ''}`}
          >
            <TextAreaField
              label="Что вы хотели бы получить?"
              name="wishlist"
              maxLength={1000}
              defaultValue={currentParticipant.wishlist ?? ''}
              placeholder="Книги, кофе, сертификат, настольная игра..."
              disabled={busy === 'wishlist'}
            />
            <TextAreaField
              label="Ссылки на подарки"
              name="wishlistLinks"
              maxLength={1500}
              defaultValue={currentParticipant.wishlistLinks ?? ''}
              placeholder="Одна ссылка на строку"
              disabled={busy === 'wishlist'}
            />
            <Button type="submit" loading={busy === 'wishlist'}>Сохранить пожелания</Button>
          </form>
        </Card>
      ) : (
        <Card className="wishlist-editor">
          <h2>Пожелания зафиксированы</h2>
          <p>После жеребьевки список остается доступным для просмотра.</p>
        </Card>
      )}
    </div>
  );
}

function RestrictionsSection({
  room,
  isOwner,
  busy,
  onAdd,
  onDelete
}: {
  room: Room;
  isOwner: boolean;
  busy: string | null;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (restrictionId: number) => void;
}) {
  const participantIds = room.participants.map((participant) => participant.participantId).join(':');
  const [giverId, setGiverId] = useState<number | null>(room.participants[0]?.participantId ?? null);
  const [receiverId, setReceiverId] = useState<number | null>(room.participants[1]?.participantId ?? room.participants[0]?.participantId ?? null);
  const duplicateRestriction = giverId !== null && receiverId !== null
    ? room.restrictions.some((restriction) =>
      restriction.giverParticipantId === giverId && restriction.receiverParticipantId === receiverId)
    : false;
  const invalidPair = giverId === null || receiverId === null || giverId === receiverId || duplicateRestriction || room.participants.length < 2;

  useEffect(() => {
    const firstParticipant = room.participants[0]?.participantId ?? null;
    const secondParticipant = room.participants[1]?.participantId ?? firstParticipant;
    setGiverId((current) => room.participants.some((participant) => participant.participantId === current) ? current : firstParticipant);
    setReceiverId((current) => {
      if (room.participants.some((participant) => participant.participantId === current)) return current;
      return secondParticipant;
    });
  }, [room.id, participantIds]);

  function submitRestriction(event: FormEvent<HTMLFormElement>) {
    if (invalidPair) {
      event.preventDefault();
      return;
    }
    onAdd(event);
  }

  return (
    <div className="restrictions-layout">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Правила жеребьевки</span>
          <h2>Кто не может дарить кому</h2>
          <p>Настройте исключения перед жеребьевкой.</p>
        </div>
      </div>

      {isOwner && room.status === 'OPEN' && (
        <Card className="restriction-editor">
          <form className="restriction-form" onSubmit={submitRestriction}>
            <label className="field">
              <span>Кто дарит</span>
              <select
                name="giverParticipantId"
                value={giverId ?? ''}
                onChange={(event) => setGiverId(Number(event.currentTarget.value))}
                required
              >
                {room.participants.map((participant) => (
                  <option value={participant.participantId} key={participant.participantId}>{participant.displayName}</option>
                ))}
              </select>
            </label>
            <div className="restriction-arrow"><ArrowRight size={18} /><span>не может получить</span></div>
            <label className="field">
              <span>Кому не может подарить</span>
              <select
                name="receiverParticipantId"
                value={receiverId ?? ''}
                onChange={(event) => setReceiverId(Number(event.currentTarget.value))}
                required
              >
                {room.participants.map((participant) => (
                  <option
                    value={participant.participantId}
                    key={participant.participantId}
                    disabled={participant.participantId === giverId}
                  >
                    {participant.displayName}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" loading={busy === 'restriction'} disabled={invalidPair}>Добавить</Button>
          </form>
          {room.participants.length < 2 && <p className="form-note">Для ограничений нужны минимум два участника.</p>}
          {giverId === receiverId && room.participants.length >= 2 && <p className="form-note">Участник не может быть ограничен от самого себя.</p>}
          {duplicateRestriction && <p className="form-note">Такое ограничение уже добавлено.</p>}
        </Card>
      )}

      <div className="restriction-list">
        {room.restrictions.length === 0 ? (
          <Card className="empty-inline">
            <p>Ограничений пока нет.</p>
          </Card>
        ) : room.restrictions.map((restriction) => (
          <article className="restriction-row" key={restriction.id}>
            <strong>{restriction.giverName}</strong>
            <span><X size={16} /> не может получить</span>
            <strong>{restriction.receiverName}</strong>
            {isOwner && room.status === 'OPEN' && (
              <IconButton label="Удалить ограничение" onClick={() => onDelete(restriction.id)}>
                <X size={15} />
              </IconButton>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function SettingsSection({
  room,
  isOwner,
  busy,
  onUpdateRoom,
  onDeleteRoom
}: {
  room: Room;
  isOwner: boolean;
  busy: string | null;
  onUpdateRoom: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteRoom: () => void;
}) {
  return (
    <div className="settings-layout">
      {isOwner && room.status === 'OPEN' ? (
        <Card className="settings-card">
          <div className="section-heading compact">
            <div>
              <h2><ScrollText size={20} /> Основные настройки</h2>
              <p>Эти поля доступны до жеребьевки.</p>
            </div>
          </div>
          <form
            className="stack-form"
            onSubmit={onUpdateRoom}
            key={`${room.id}-${room.name}-${room.description ?? ''}-${room.celebrationDate ?? ''}-${room.giftBudget ?? ''}`}
          >
            <Field label="Название" name="name" maxLength={140} defaultValue={room.name} required />
            <TextAreaField label="Описание" name="description" maxLength={800} defaultValue={room.description ?? ''} />
            <div className="form-two">
              <Field label="Дата праздника" name="celebrationDate" type="date" min={todayDateInputValue()} defaultValue={room.celebrationDate ?? ''} />
              <Field label="Бюджет" name="giftBudget" type="number" min="0" step="100" defaultValue={room.giftBudget ?? ''} />
            </div>
            <Button type="submit" loading={busy === 'room'}>Сохранить изменения</Button>
          </form>
        </Card>
      ) : (
        <Card className="settings-card">
          <h2>Настройки недоступны</h2>
          <p>{isOwner ? 'После жеребьевки ключевые параметры комнаты зафиксированы.' : 'Редактировать комнату может только владелец.'}</p>
        </Card>
      )}

      {isOwner && (
        <Card className="danger-zone">
          <span className="eyebrow">Опасная зона</span>
          <h2>Удаление комнаты</h2>
          <p>Это действие удалит участников, пожелания и ограничения комнаты без восстановления.</p>
          <Button type="button" variant="danger" onClick={onDeleteRoom}>
            <Trash2 size={17} />
            Удалить комнату
          </Button>
        </Card>
      )}
    </div>
  );
}

function AssignmentReveal({
  assignment,
  fresh,
  onClose
}: {
  assignment: MyAssignment;
  fresh: boolean;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(fresh);
  const links = splitLinks(assignment.receiverWishlistLinks);

  return (
    <Modal title={revealed ? 'Ваш получатель' : 'Получатель определен'} onClose={onClose}>
      <div className={fresh ? 'assignment-reveal fresh cinematic-draw' : 'assignment-reveal cinematic-draw'}>
        {fresh && <div className="confetti" aria-hidden="true" />}
        {!revealed ? (
          <div className="assignment-sealed">
            <PremiumGiftObject className="assignment-gift" />
            <span className="eyebrow">Назначение готово</span>
            <h2>Откройте подарок</h2>
            <p>Получатель появится после короткого открытия.</p>
            <Button type="button" variant="accent" onClick={() => setRevealed(true)}>
              <Gift size={17} />
              Открыть подарок
            </Button>
          </div>
        ) : (
          <div className="assignment-result">
            <PremiumGiftObject open className="assignment-gift" />
            <Avatar name={assignment.receiverName} avatarUrl={assignment.receiverAvatarUrl} size="xl" />
            <span className="eyebrow">Вам выпал</span>
            <h2>{assignment.receiverName}</h2>
            <p>{assignment.receiverWishlist || 'Пожелания пока не заполнены.'}</p>
            {links.length > 0 && (
              <div className="wishlist-links">
                {links.map((link) => {
                  const href = safeExternalHref(link);
                  return href
                    ? <a href={href} target="_blank" rel="noreferrer" key={link}>{link}</a>
                    : <span key={link}>{link}</span>;
                })}
              </div>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>Вернуться в комнату</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
