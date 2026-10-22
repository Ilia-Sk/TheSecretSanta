import {
  ArrowRight,
  Ban,
  CalendarDays,
  ChevronRight,
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
import { createPortal } from 'react-dom';
import type { MyAssignment, Room } from '../api';
import { request } from '../api';
import { ParticipantCard } from '../components/ParticipantCard';
import { StatusBadge } from '../components/RoomCard';
import { AnimatePresence, motion } from 'motion/react';
import { BorderBeam, Dock, DockIcon, NumberTicker } from '../components/magicui';
import { Avatar, Button, Card, ConfirmDialog, Field, IconButton, Modal, SectionTitle, TextAreaField } from '../components/ui';
import { BackgroundPaths } from '../components/twentyfirst';
import { CubeGift, Gift3D, GiftPile, ProductShelf, toneForStatus, type GiftTone } from '../components/visual';
import { useHeroDepth } from '../hooks/motion';
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
  const heroRef = useRef<HTMLElement>(null);
  const giftDepth = useHeroDepth(heroRef);
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

  const tone = toneForStatus(room.status);
  const primaryAction = isOwner && room.status === 'OPEN'
    ? { label: 'Провести жеребьевку', short: 'Жеребьевка', icon: Shuffle, onClick: () => setConfirmDraw(true) }
    : room.status === 'DRAWN' && assignment
      ? { label: 'Открыть подарок', short: 'Открыть подарок', icon: Gift, onClick: () => setShowAssignment(true) }
      : null;
  const tabIndex = visibleTabs.findIndex((tab) => tab.id === activeTab);
  const previousTabIndex = useRef(tabIndex);
  const direction = tabIndex >= previousTabIndex.current ? 1 : -1;
  useEffect(() => {
    previousTabIndex.current = tabIndex;
  }, [tabIndex]);

  function selectTab(tab: RoomTab) {
    setActiveTab(tab);
    const anchor = document.getElementById('room-content');
    if (anchor && anchor.getBoundingClientRect().top < 100) {
      window.scrollTo({ top: anchor.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    }
  }

  return (
    <div className="page room-page">
      <nav className="local-nav" aria-label="Комната">
        <div className="local-nav-inner glass">
          <span className={`status-dot status-${room.status.toLowerCase()}`} aria-hidden="true" />
          <strong className="local-title">{room.name}</strong>
          <span className="local-section">{visibleTabs[tabIndex]?.label}</span>
          {primaryAction && (
            <motion.button type="button" className="nav-cta local-cta" onClick={primaryAction.onClick} whileTap={{ scale: 0.94 }}>
              {primaryAction.short}
            </motion.button>
          )}
        </div>
      </nav>

      <motion.section
        className={`room-hero dark-section tone-${tone}`}
        ref={heroRef}
        layoutId={`room-card-${room.id}`}
        transition={{ type: 'spring', stiffness: 170, damping: 26 }}
      >
        <div className="hero-aurora" aria-hidden="true" />
        <BackgroundPaths className="room-paths" count={36} angle={-6} speed={0.6} />
        <motion.div
          className="room-hero-copy"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <StatusBadge status={room.status} />
          <h1>{room.name}</h1>
          <p>{room.description || statusHints[room.status]}</p>
          <div className="hero-meta">
            <span><CalendarDays size={15} />{formatDate(room.celebrationDate)}</span>
            <span><Gift size={15} />{formatBudget(room.giftBudget)}</span>
            <span><Users size={15} />{room.participants.length} участников</span>
          </div>
          <div className="room-hero-actions">
            {isOwner && room.status === 'OPEN' && (
              <Button type="button" variant="metal" onClick={() => setConfirmDraw(true)}>
                <Shuffle size={18} />
                Провести жеребьевку
              </Button>
            )}
            {room.status === 'DRAWN' && assignment && (
              <Button type="button" variant="metal" onClick={() => setShowAssignment(true)}>
                <Gift size={18} />
                Открыть подарок
              </Button>
            )}
            <button type="button" className="link-arrow link-arrow-light" onClick={() => selectTab('participants')}>
              Участники <ChevronRight size={15} />
            </button>
          </div>
        </motion.div>
        <motion.div className="room-hero-visual" style={giftDepth}>
          <Gift3D className="room-gift" tone={tone} open={room.status === 'DRAWN'} />
        </motion.div>
      </motion.section>

      <div className="tab-stage">
        <span id="room-content" className="anchor" aria-hidden="true" />
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.section
            className="tab-panel"
            id={`room-tab-panel-${activeTab}`}
            key={`${room.id}-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`room-tab-trigger-${activeTab}`}
            custom={direction}
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
              center: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: dir * -48 })
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
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
                <SectionTitle eyebrow="Состав комнаты" title="Участники." text="Карточки показывают владельца комнаты и заполненность пожеланий." />
                <Card className="pile-card tile-dark" tilt={false}>
                  <GiftPile
                    count={Math.min(Math.max(room.participants.length, 3), 20)}
                    width={14}
                    hint="Один подарок — один участник. Хватайте, бросайте, кликайте"
                  />
                </Card>
                <div className="participants-grid">
                  {room.participants.map((participant, index) => (
                    <ParticipantCard
                      participant={participant}
                      currentUserId={currentUserId}
                      key={participant.participantId}
                      index={index}
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
          </motion.section>
        </AnimatePresence>
      </div>

      {createPortal(<div className="dock-wrap">
        <Dock label="Разделы комнаты">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <DockIcon
                key={tab.id}
                id={`room-tab-trigger-${tab.id}`}
                controls={`room-tab-panel-${tab.id}`}
                label={tab.label}
                active={activeTab === tab.id}
                onClick={() => selectTab(tab.id)}
              >
                <Icon size={19} />
              </DockIcon>
            );
          })}
        </Dock>
      </div>, document.body)}

      {createPortal(<AnimatePresence>
        {drawFocus && (
          <motion.div
            key="draw"
            className={`draw-focus-overlay draw-phase-${drawPhase}`}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
          >
            <BackgroundPaths className="draw-paths" count={54} angle={0} speed={drawPhase === 'requesting' ? 2.2 : 1} interactive={false} />
            <GiftPile className="draw-pile" count={Math.min(Math.max(room.participants.length, 4), 18)} width={22} maxGifts={20} interactive={false} />
            <motion.div
              className="draw-rays"
              aria-hidden="true"
              animate={{ opacity: drawPhase === 'requesting' ? 0 : 1, scale: drawPhase === 'requesting' ? 0.8 : 1 }}
              transition={{ duration: 1 }}
            />
            <div className="draw-focus-panel">
              <motion.div
                initial={{ scale: 0.6, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18 }}
              >
                <Gift3D
                  className="draw-gift"
                  tone={tone}
                  interactive={false}
                  autoRotate
                  revealState={drawPhase === 'opening' ? 'opening' : drawPhase === 'complete' ? 'open' : 'closed'}
                  onRevealComplete={finishDrawAnimation}
                />
              </motion.div>
              <span className="eyebrow eyebrow-warm">Жеребьевка</span>
              <AnimatePresence mode="wait">
                <motion.div
                  key={drawPhase}
                  className="draw-copy"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35 }}
                >
                  <h2>{drawPhase === 'requesting' ? 'Проводим жеребьевку' : drawPhase === 'opening' ? 'Открываем подарок' : 'Получатели определены'}</h2>
                  <p>{drawPhase === 'requesting'
                    ? 'Система учитывает участников и ограничения комнаты.'
                    : drawPhase === 'opening'
                      ? 'Готовим ваше назначение.'
                      : 'Каждый участник увидит только свое назначение.'}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      <AnimatePresence>
        {confirmDraw && (
          <ConfirmDialog
            key="confirm-draw"
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
            key="confirm-delete"
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
            key="assignment"
            assignment={assignment}
            tone={tone}
            fresh={drawCelebration}
            onClose={() => {
              setShowAssignment(false);
              setDrawCelebration(false);
            }}
          />
        )}
      </AnimatePresence>
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
  const facts = [
    { label: 'Дата', value: formatDate(room.celebrationDate) },
    { label: 'Бюджет', value: formatBudget(room.giftBudget) },
    { label: 'Участники', value: String(room.participants.length), numeric: room.participants.length },
    ...(isOwner ? [{ label: 'Ограничения', value: String(room.restrictions.length), numeric: room.restrictions.length }] : [])
  ];

  return (
    <div className="overview-grid">
      <Card className="overview-card tile-dark tile-span-2">
        <span className="eyebrow">Состояние</span>
        <h2>{statusHints[room.status]}</h2>
        <CubeGift size={64} tone={toneForStatus(room.status)} open={room.status === 'DRAWN'} className="overview-cube" />
      </Card>

      <Card className={`assignment-card tile-span-2 ${room.status === 'DRAWN' && assignment ? 'is-ready' : ''}`} delay={0.08}>
        {room.status === 'DRAWN' && assignment && <BorderBeam size={150} duration={7} />}
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
        <CubeGift size={70} tone="red" open={room.status === 'DRAWN'} className="assignment-cube" />
      </Card>

      <div className="facts-row">
        {facts.map((fact, index) => (
          <Card className="fact-tile" key={fact.label} delay={index * 0.07}>
            <span>{fact.label}</span>
            <strong>{'numeric' in fact && typeof fact.numeric === 'number' ? <NumberTicker value={fact.numeric} delay={0.2 + index * 0.1} /> : fact.value}</strong>
          </Card>
        ))}
      </div>

      <Card className="invite-card tile-span-full">
        <div className="invite-copy">
          <span className="tile-icon tile-icon-blue"><LinkIcon size={18} /></span>
          <h2>Приглашение</h2>
          <p>Скопируйте ссылку и отправьте ее участникам.</p>
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
          <ProductShelf links={links} toHref={safeExternalHref} />
        ) : (
          <p>Ссылки появятся здесь после сохранения.</p>
        )}
      </Card>

      {roomStatus === 'OPEN' ? (
        <Card className="wishlist-editor">
          <div className="section-title">
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
      <div className="section-title">
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
        {room.restrictions.length === 0 && (
          <Card className="empty-inline" tilt={false}>
            <p>Ограничений пока нет.</p>
          </Card>
        )}
        <AnimatePresence initial={false}>
          {room.restrictions.map((restriction) => (
            <motion.article
              layout
              className="restriction-row"
              key={restriction.id}
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <strong>{restriction.giverName}</strong>
              <span><X size={16} /> не может получить</span>
              <strong>{restriction.receiverName}</strong>
              {isOwner && room.status === 'OPEN' && (
                <IconButton label="Удалить ограничение" onClick={() => onDelete(restriction.id)}>
                  <X size={15} />
                </IconButton>
              )}
            </motion.article>
          ))}
        </AnimatePresence>
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
          <div className="section-title">
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
  tone,
  fresh,
  onClose
}: {
  assignment: MyAssignment;
  tone: GiftTone;
  fresh: boolean;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(fresh);
  const links = splitLinks(assignment.receiverWishlistLinks);

  return (
    <Modal title={revealed ? 'Ваш получатель' : 'Получатель определен'} onClose={onClose} tone="dark">
      <div className={revealed ? 'assignment-reveal is-revealed' : 'assignment-reveal'}>
        {revealed && <Confetti3D />}
        <Gift3D className="assignment-gift" tone={tone} open={revealed} interactive={!revealed} />
        <AnimatePresence mode="wait" initial={false}>
          {!revealed ? (
            <motion.div
              key="sealed"
              className="assignment-sealed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <span className="eyebrow eyebrow-warm">Назначение готово</span>
              <h2>Откройте подарок</h2>
              <p>Получатель появится после короткого открытия.</p>
              <Button type="button" variant="accent" onClick={() => setRevealed(true)}>
                <Gift size={17} />
                Открыть подарок
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              className="assignment-result"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.35 } } }}
            >
              <motion.div variants={revealItem}>
                <Avatar name={assignment.receiverName} avatarUrl={assignment.receiverAvatarUrl} size="xl" />
              </motion.div>
              <motion.span variants={revealItem} className="eyebrow eyebrow-warm">Вам выпал</motion.span>
              <h2 className="assignment-name" aria-label={assignment.receiverName}>
                {Array.from(assignment.receiverName).map((char, index) => (
                  <motion.span
                    key={index}
                    aria-hidden="true"
                    className="gradient-text"
                    variants={{
                      hidden: { opacity: 0, y: 24, rotateX: -90 },
                      show: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 260, damping: 18 } }
                    }}
                  >
                    {char === ' ' ? '\u00a0' : char}
                  </motion.span>
                ))}
              </h2>
              <motion.p variants={revealItem}>{assignment.receiverWishlist || 'Пожелания пока не заполнены.'}</motion.p>
              {links.length > 0 && (
                <motion.div variants={revealItem} className="wishlist-links">
                  {links.map((link) => {
                    const href = safeExternalHref(link);
                    return href
                      ? <a href={href} target="_blank" rel="noreferrer" key={link}>{link}</a>
                      : <span key={link}>{link}</span>;
                  })}
                </motion.div>
              )}
              <motion.div variants={revealItem}>
                <Button type="button" variant="light" onClick={onClose}>Вернуться в комнату</Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

const revealItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } }
};

const confettiColors = ['#f5c66b', '#ff8a3d', '#ffd60a', '#34c38f', '#d9573b', '#fff4d6', '#ffffff'];

function Confetti3D() {
  const pieces = useMemo(() => Array.from({ length: 46 }, (_, index) => {
    const r = (seed: number) => {
      const x = Math.sin((index + 1) * seed) * 10000;
      return x - Math.floor(x);
    };
    return {
      left: r(12.9898) * 100,
      delay: r(78.233) * 0.6,
      duration: 2.2 + r(39.425) * 1.6,
      drift: (r(4.1414) - 0.5) * 160,
      spin: 360 + r(9.31) * 720,
      color: confettiColors[index % confettiColors.length],
      wide: r(2.71) > 0.5
    };
  }), []);

  return (
    <div className="confetti-3d" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={piece.wide ? 'wide' : ''}
          style={{
            left: `${piece.left}%`,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            '--drift': `${piece.drift}px`,
            '--spin': `${piece.spin}deg`
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
