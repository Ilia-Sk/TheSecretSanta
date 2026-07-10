import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Copy,
  Crown,
  Gift,
  LogOut,
  PartyPopper,
  Plus,
  ScrollText,
  Settings,
  Shuffle,
  Sparkles,
  Ticket,
  UserCircle,
  Users,
  WalletCards
} from 'lucide-react';
import { AuthResponse, InvitePreview, MyAssignment, Profile, Room, request } from './api';

type AuthMode = 'login' | 'register';
type ViewMode = 'create' | 'room' | 'assignment' | 'profile';

localStorage.removeItem('secret-santa-auth');
const storedAuth = sessionStorage.getItem('secret-santa-auth');

const statusLabels: Record<Room['status'], string> = {
  OPEN: 'Открыта',
  DRAWN: 'Распределена',
  CLOSED: 'Закрыта'
};

export function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(storedAuth ? JSON.parse(storedAuth) : null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [assignment, setAssignment] = useState<MyAssignment | null>(null);
  const [view, setView] = useState<ViewMode>('create');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inviteCode = window.location.pathname.startsWith('/join/')
    ? window.location.pathname.replace('/join/', '')
    : null;

  const selectedRoom = useMemo(
    () => selectedRoomId === null ? null : rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  useEffect(() => {
    if (!auth) return;
    loadProfile();
    loadRooms();
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    const timerId = window.setInterval(() => {
      loadRooms({ silent: true });
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [auth, selectedRoomId]);

  useEffect(() => {
    setAssignment(null);
    if (auth && selectedRoom?.status === 'DRAWN') {
      request<MyAssignment>(`/rooms/${selectedRoom.id}/my-assignment`, {}, auth.token)
        .then(setAssignment)
        .catch((err) => setError(err.message));
    }
  }, [auth, selectedRoom?.id, selectedRoom?.status]);

  async function loadRooms(options: { preferredRoomId?: number; silent?: boolean } = {}) {
    if (!auth) return;
    const data = await request<Room[]>('/rooms', {}, auth.token);
    setRooms((previous) => {
      if (options.silent) {
        const previousStatuses = new Map(previous.map((room) => [room.id, room.status]));
        const drawnRoom = data.find((room) => previousStatuses.get(room.id) === 'OPEN' && room.status === 'DRAWN');
        if (drawnRoom) {
          setNotice(`В комнате "${drawnRoom.name}" проведена жеребьевка`);
          if (drawnRoom.id === selectedRoomId) {
            setView('assignment');
          }
        }
      }
      return data;
    });
    setSelectedRoomId((current) => {
      if (options.preferredRoomId) {
        return options.preferredRoomId;
      }
      if (options.silent) {
        return current;
      }
      return current ?? data[0]?.id ?? null;
    });
    if (options.preferredRoomId) {
      setView('room');
    } else if (!options.silent) {
      setView((current) => current === 'create' && data.length > 0 ? 'room' : current);
    }
  }

  async function loadProfile() {
    if (!auth) return;
    const data = await request<Profile>('/profile', {}, auth.token);
    setProfile(data);
  }

  function saveAuth(nextAuth: AuthResponse) {
    setAuth(nextAuth);
    sessionStorage.setItem('secret-santa-auth', JSON.stringify(nextAuth));
  }

  function updateStoredAuth(nextProfile: Profile) {
    if (!auth) return;
    const nextAuth = {
      ...auth,
      displayName: nextProfile.displayName,
      avatarUrl: nextProfile.avatarUrl
    };
    setAuth(nextAuth);
    sessionStorage.setItem('secret-santa-auth', JSON.stringify(nextAuth));
  }

  function logout() {
    setAuth(null);
    setProfile(null);
    setRooms([]);
    setSelectedRoomId(null);
    setView('create');
    sessionStorage.removeItem('secret-santa-auth');
  }

  async function runAction(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    }
  }

  if (!auth) {
    return <AuthScreen onAuth={saveAuth} onError={setError} error={error} />;
  }

  const visibleProfile = profile ?? {
    id: auth.userId,
    email: auth.email,
    displayName: auth.displayName,
    avatarUrl: auth.avatarUrl
  };

  return (
    <div className="app-shell">
      <div className="snow-layer" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Gift size={22} /></div>
          <div>
            <strong>The Secret Santa</strong>
            <span>Christmas draw manager</span>
          </div>
        </div>

        <button className="profile-chip" onClick={() => setView('profile')}>
          <Avatar name={visibleProfile.displayName} avatarUrl={visibleProfile.avatarUrl} />
          <span>
            <strong>{visibleProfile.displayName}</strong>
            <small>Профиль</small>
          </span>
          <Settings size={17} />
        </button>

        <button className="primary-action" onClick={() => {
          setSelectedRoomId(null);
          setView('create');
        }}>
          <Plus size={18} />
          Новая комната
        </button>

        <div className="room-list">
          {rooms.map((room) => (
            <button
              key={room.id}
              className={selectedRoom?.id === room.id && view === 'room' ? 'room-link active' : 'room-link'}
              onClick={() => {
                setSelectedRoomId(room.id);
                setView('room');
              }}
            >
              <span>{room.name}</span>
              <small>{statusLabels[room.status]} · {room.participants.length} участн.</small>
            </button>
          ))}
        </div>

        <button className="ghost-action" onClick={logout}>
          <LogOut size={17} />
          Выйти
        </button>
      </aside>

      <main className="workspace">
        <header className="workspace-topbar">
          <div>
            <span className="eyebrow">Holiday draw workspace</span>
            <h1>{inviteCode ? 'Присоединение к комнате' : topbarTitle(view, selectedRoom)}</h1>
          </div>
          <div className="topbar-pill">
            <Sparkles size={17} />
            {rooms.length} комнат
          </div>
        </header>

        {error && <div className="alert">{error}</div>}
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>ОК</button>
          </div>
        )}

        {inviteCode ? (
          <JoinRoom token={auth.token} inviteCode={inviteCode} onJoined={async (joinedRoom) => {
            window.history.replaceState({}, '', '/');
            await loadRooms({ preferredRoomId: joinedRoom.id });
            setView('room');
          }} />
        ) : view === 'profile' ? (
          <ProfileView
            token={auth.token}
            profile={visibleProfile}
            onSaved={(nextProfile) => {
              setProfile(nextProfile);
              updateStoredAuth(nextProfile);
            }}
          />
        ) : view === 'assignment' && selectedRoom ? (
          assignment ? (
            <AssignmentView room={selectedRoom} assignment={assignment} onBack={() => setView('room')} />
          ) : (
            <AssignmentLoading room={selectedRoom} onBack={() => setView('room')} />
          )
        ) : view === 'room' && selectedRoom ? (
          <RoomDetails
            room={selectedRoom}
            token={auth.token}
            assignment={assignment}
            onChanged={loadRooms}
            openAssignment={() => setView('assignment')}
            runAction={runAction}
          />
        ) : (
          <CreateRoom token={auth.token} onCreated={async (createdRoom) => {
            await loadRooms({ preferredRoomId: createdRoom.id });
            setView('room');
          }} />
        )}
      </main>
    </div>
  );
}

function topbarTitle(view: ViewMode, room: Room | null) {
  if (view === 'profile') return 'Профиль пользователя';
  if (view === 'assignment') return 'Ваш Тайный Санта';
  if (room) return room.name;
  return 'Создание обмена подарками';
}

function AuthScreen({ onAuth, onError, error }: {
  onAuth: (auth: AuthResponse) => void;
  onError: (message: string | null) => void;
  error: string | null;
}) {
  const [mode, setMode] = useState<AuthMode>('login');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    const form = new FormData(event.currentTarget);
    const path = mode === 'login' ? '/auth/login' : '/auth/register';
    const payload = {
      email: String(form.get('email')),
      password: String(form.get('password')),
      displayName: String(form.get('displayName') ?? '')
    };

    try {
      const auth = await request<AuthResponse>(path, {
        method: 'POST',
        body: JSON.stringify(mode === 'login' ? { email: payload.email, password: payload.password } : payload)
      });
      onAuth(auth);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Auth failed');
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="hero-snow" />
        <div className="hero-copy">
          <div className="badge glass"><Sparkles size={16} /> Новогодняя жеребьевка</div>
          <h1>The Secret Santa</h1>
          <p>Создавайте комнаты, приглашайте друзей по ссылке и запускайте честное распределение подарков с персональными ограничениями.</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mode-switch">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Вход</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Регистрация</button>
          </div>
          {error && <div className="alert">{error}</div>}
          <form onSubmit={submit} className="form-grid">
            {mode === 'register' && <input name="displayName" placeholder="Имя" required />}
            <input name="email" type="email" placeholder="Email" required />
            <input name="password" type="password" placeholder="Пароль" minLength={6} required />
            <button className="submit-button">{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
          </form>
        </div>
      </section>
    </main>
  );
}

function CreateRoom({ token, onCreated }: { token: string; onCreated: (room: Room) => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const createdRoom = await request<Room>('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        name: String(form.get('name')),
        description: String(form.get('description')),
        celebrationDate: form.get('celebrationDate') ? String(form.get('celebrationDate')) : null,
        giftBudget: form.get('giftBudget') ? Number(form.get('giftBudget')) : null,
        wishlist: String(form.get('wishlist')),
        wishlistLinks: String(form.get('wishlistLinks'))
      })
    }, token);
    await onCreated(createdRoom);
  }

  return (
    <section className="create-view">
      <div className="create-hero">
        <div className="badge glass"><PartyPopper size={16} /> Новый обмен</div>
        <h2>Соберите участников и запустите честную жеребьевку</h2>
        <p>Комната создается сразу с вами в роли хозяина и участника. После жеребьевки каждый увидит только своего получателя.</p>
        <div className="hero-stats">
          <span><Users size={16} /> Участники</span>
          <span><Shuffle size={16} /> Ограничения</span>
          <span><Gift size={16} /> Wishlist</span>
        </div>
      </div>

      <form className="create-form" onSubmit={submit}>
        <FormSection icon={<ScrollText size={20} />} title="Детали комнаты" text="Название и краткое описание праздника.">
          <div className="form-grid">
            <label>
              <span>Название</span>
              <input name="name" placeholder="Например, Christmas Party 2026" required />
            </label>
            <label>
              <span>Описание</span>
              <textarea name="description" placeholder="Пара слов о компании, формате и настроении обмена" />
            </label>
          </div>
        </FormSection>

        <FormSection icon={<CalendarDays size={20} />} title="Параметры обмена" text="Дата и ориентир по стоимости подарка.">
          <div className="form-grid two-columns">
            <label>
              <span>Дата праздника</span>
              <input name="celebrationDate" type="date" />
            </label>
            <label>
              <span>Бюджет</span>
              <input name="giftBudget" type="number" min="0" step="100" placeholder="3000" />
            </label>
          </div>
        </FormSection>

        <FormSection icon={<WalletCards size={20} />} title="Мои пожелания" text="Их увидит только человек, который будет дарить вам подарок." accent>
          <div className="form-grid">
            <label>
              <span>Wishlist</span>
              <textarea name="wishlist" placeholder="Книги, кофе, настольные игры, сертификаты..." />
            </label>
            <label>
              <span>Ссылки на подарки</span>
              <textarea name="wishlistLinks" placeholder="Одна ссылка на строку: маркетплейс, магазин, подборка..." />
            </label>
          </div>
        </FormSection>

        <button className="submit-button create-submit">Создать комнату</button>
      </form>
    </section>
  );
}

function JoinRoom({ token, inviteCode, onJoined }: { token: string; inviteCode: string; onJoined: (room: Room) => Promise<void> }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);

  useEffect(() => {
    request<InvitePreview>(`/rooms/invite/${inviteCode}`, {}, token)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [inviteCode, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const joinedRoom = await request<Room>(`/rooms/join/${inviteCode}`, {
      method: 'POST',
      body: JSON.stringify({
        wishlist: String(form.get('wishlist')),
        wishlistLinks: String(form.get('wishlistLinks'))
      })
    }, token);
    await onJoined(joinedRoom);
  }

  return (
    <section className="panel wide-panel create-panel">
      <FormSection
        icon={<Ticket size={20} />}
        title={preview ? `Присоединиться к "${preview.name}"` : 'Присоединиться к комнате'}
        text={preview?.description || 'Добавьте пожелания, которые увидит ваш Тайный Санта.'}
      >
        <form className="form-grid" onSubmit={submit}>
          <textarea name="wishlist" placeholder="Что ты хотел бы получить в подарок?" />
          <textarea name="wishlistLinks" placeholder="Ссылки на желаемые подарки, по одной на строку" />
          <button className="submit-button">Войти в комнату</button>
        </form>
      </FormSection>
    </section>
  );
}

function ProfileView({ token, profile, onSaved }: {
  token: string;
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updated = await request<Profile>('/profile', {
      method: 'PUT',
      body: JSON.stringify({
        displayName: String(form.get('displayName')),
        avatarUrl: String(form.get('avatarUrl'))
      })
    }, token);
    onSaved(updated);
    setSaved(true);
  }

  return (
    <section className="profile-view">
      <div className="profile-preview">
        <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} large />
        <h2>{profile.displayName}</h2>
        <p>{profile.email}</p>
      </div>
      <form className="profile-form" onSubmit={submit}>
        <FormSection icon={<UserCircle size={20} />} title="Профиль" text="Добавьте имя и ссылку на фото. Позже можно заменить это настоящей загрузкой файла.">
          <div className="form-grid">
            <label>
              <span>Имя</span>
              <input name="displayName" defaultValue={profile.displayName} required />
            </label>
            <label>
              <span>Ссылка на фото</span>
              <input name="avatarUrl" defaultValue={profile.avatarUrl ?? ''} placeholder="https://..." />
            </label>
            <button className="submit-button">Сохранить профиль</button>
            {saved && <div className="success-note">Профиль обновлен</div>}
          </div>
        </FormSection>
      </form>
    </section>
  );
}

function RoomDetails({ room, token, assignment, onChanged, openAssignment, runAction }: {
  room: Room;
  token: string;
  assignment: MyAssignment | null;
  onChanged: () => Promise<void>;
  openAssignment: () => void;
  runAction: (action: () => Promise<void>) => Promise<void>;
}) {
  async function addRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      await request<Room>(`/rooms/${room.id}/restrictions`, {
        method: 'POST',
        body: JSON.stringify({
          giverParticipantId: Number(form.get('giverParticipantId')),
          receiverParticipantId: Number(form.get('receiverParticipantId'))
        })
      }, token);
      await onChanged();
    });
  }

  async function updateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      await request<Room>(`/rooms/${room.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: String(form.get('name')),
          description: String(form.get('description')),
          celebrationDate: form.get('celebrationDate') ? String(form.get('celebrationDate')) : null,
          giftBudget: form.get('giftBudget') ? Number(form.get('giftBudget')) : null
        })
      }, token);
      await onChanged();
    });
  }

  async function deleteRestriction(restrictionId: number) {
    await runAction(async () => {
      await request<Room>(`/rooms/${room.id}/restrictions/${restrictionId}`, {
        method: 'DELETE'
      }, token);
      await onChanged();
    });
  }

  const inviteLink = `${window.location.origin}/join/${room.inviteCode}`;

  return (
    <div className="room-grid">
      <section className="room-header">
        <div className="room-header-content">
          <div className="badge"><Ticket size={16} /> {statusLabels[room.status]}</div>
          <h1>{room.name}</h1>
          <div className="room-meta">
            <span><Users size={16} /> {room.participants.length} участников</span>
            {room.celebrationDate && <span><CalendarDays size={16} /> {room.celebrationDate}</span>}
            {room.giftBudget && <span><Gift size={16} /> до {room.giftBudget} ₽</span>}
          </div>
        </div>
        {room.owner && room.status === 'OPEN' && (
          <button className="draw-button" onClick={() => runAction(async () => {
            await request<Room>(`/rooms/${room.id}/draw`, { method: 'POST' }, token);
            await onChanged();
            openAssignment();
          })}>
            <Shuffle size={18} />
            Провести жеребьевку
          </button>
        )}
        {room.status === 'DRAWN' && assignment && (
          <button className="draw-button" onClick={openAssignment}>
            <Gift size={18} />
            Кому я дарю
          </button>
        )}
      </section>

      {room.description && (
        <section className="panel room-description">
          <div className="section-title compact">
            <span><ScrollText size={19} /></span>
            <h2>Описание комнаты</h2>
          </div>
          <p>{room.description}</p>
        </section>
      )}

      {room.owner && room.status === 'OPEN' && (
        <section className="panel">
          <div className="section-title compact">
            <span><ScrollText size={19} /></span>
            <h2>Редактирование комнаты</h2>
          </div>
          <form className="room-edit-form" onSubmit={updateRoom}>
            <label>
              <span>Название</span>
              <input name="name" defaultValue={room.name} required />
            </label>
            <label>
              <span>Описание</span>
              <textarea name="description" defaultValue={room.description ?? ''} />
            </label>
            <div className="form-grid two-columns">
              <label>
                <span>Дата праздника</span>
                <input name="celebrationDate" type="date" defaultValue={room.celebrationDate ?? ''} />
              </label>
              <label>
                <span>Бюджет</span>
                <input name="giftBudget" type="number" min="0" step="100" defaultValue={room.giftBudget ?? ''} />
              </label>
            </div>
            <button className="submit-button">Сохранить изменения</button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-title compact">
          <span><Users size={19} /></span>
          <h2>Участники</h2>
        </div>
        <div className="participants">
          {room.participants.map((participant) => (
            <div className="participant" key={participant.participantId}>
              <Avatar name={participant.displayName} avatarUrl={participant.avatarUrl} />
              <div>
                <strong>{participant.displayName}</strong>
                <span>{participant.owner ? <><Crown size={14} /> Хозяин комнаты</> : 'Участник'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-title compact">
          <span><Ticket size={19} /></span>
          <h2>Приглашение</h2>
        </div>
        <div className="invite-row">
          <a className="invite-box" href={inviteLink}>{inviteLink}</a>
          <button className="icon-button" type="button" title="Скопировать ссылку" onClick={() => navigator.clipboard.writeText(inviteLink)}>
            <Copy size={18} />
          </button>
        </div>
      </section>

      {room.owner && room.status === 'OPEN' && (
        <section className="panel">
          <div className="section-title compact">
            <span><Shuffle size={19} /></span>
            <h2>Ограничения</h2>
          </div>
          <form className="restriction-form" onSubmit={addRestriction}>
            <select name="giverParticipantId" required>
              {room.participants.map((participant) => (
                <option value={participant.participantId} key={participant.participantId}>{participant.displayName}</option>
              ))}
            </select>
            <select name="receiverParticipantId" required>
              {room.participants.map((participant) => (
                <option value={participant.participantId} key={participant.participantId}>{participant.displayName}</option>
              ))}
            </select>
            <button className="submit-button">Добавить</button>
          </form>
          <div className="restriction-list">
            {room.restrictions.map((restriction) => (
              <span key={restriction.id}>
                {restriction.giverName} не дарит {restriction.receiverName}
                <button type="button" onClick={() => deleteRestriction(restriction.id)}>Удалить</button>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AssignmentView({ room, assignment, onBack }: {
  room: Room;
  assignment: MyAssignment;
  onBack: () => void;
}) {
  return (
    <section className="assignment-view">
      <div className="assignment-card">
        <div className="gift-result-icon"><Gift size={34} /></div>
        <span className="eyebrow">Ваш получатель</span>
        <Avatar name={assignment.receiverName} avatarUrl={assignment.receiverAvatarUrl} large />
        <h2>{assignment.receiverName}</h2>
        <p>{assignment.receiverWishlist || 'Пожелания не указаны.'}</p>
        <WishlistLinks value={assignment.receiverWishlistLinks} />
        <button className="ghost-action" onClick={onBack}>Вернуться в комнату {room.name}</button>
      </div>
    </section>
  );
}

function AssignmentLoading({ room, onBack }: { room: Room; onBack: () => void }) {
  return (
    <section className="assignment-view">
      <div className="assignment-card assignment-loading">
        <div className="gift-result-icon"><Gift size={34} /></div>
        <span className="eyebrow">Жеребьевка завершена</span>
        <h2>Открываем результат</h2>
        <p>Секунду, загружаем информацию о том, кому вы дарите подарок.</p>
        <button className="ghost-action" onClick={onBack}>Вернуться в комнату {room.name}</button>
      </div>
    </section>
  );
}

function WishlistLinks({ value }: { value: string | null }) {
  const links = (value ?? '')
    .split(/\r?\n/)
    .map((link) => link.trim())
    .filter(Boolean);

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="wishlist-links">
      {links.map((link) => (
        <a href={link} target="_blank" rel="noreferrer" key={link}>{link}</a>
      ))}
    </div>
  );
}

function FormSection({ icon, title, text, accent, children }: {
  icon: ReactNode;
  title: string;
  text: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={accent ? 'form-section accent-section' : 'form-section'}>
      <div className="section-title">
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Avatar({ name, avatarUrl, large }: { name: string; avatarUrl?: string | null; large?: boolean }) {
  const className = large ? 'avatar avatar-large' : 'avatar';
  if (avatarUrl) {
    return <img className={className} src={avatarUrl} alt={name} />;
  }
  return <div className={className}>{name.slice(0, 1).toUpperCase()}</div>;
}
