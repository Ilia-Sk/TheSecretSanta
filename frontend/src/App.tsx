import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthResponse, MyAssignment, Profile, Room } from './api';
import { request } from './api';
import { AppLayout } from './components/layout';
import { Toasts } from './components/ui';
import { AuthPage } from './pages/AuthPage';
import { CreateRoomModal } from './pages/CreateRoomModal';
import { DashboardPage } from './pages/DashboardPage';
import { JoinPage } from './pages/JoinPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoomPage } from './pages/RoomPage';
import type { AppView, ToastMessage, ToastType } from './types';

const storedAuth = readStoredAuth();

export function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(storedAuth);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [assignment, setAssignment] = useState<MyAssignment | null>(null);
  const [view, setView] = useState<AppView>('dashboard');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const inviteCode = window.location.pathname.startsWith('/join/')
    ? window.location.pathname.replace('/join/', '').trim()
    : null;

  const selectedRoom = useMemo(
    () => selectedRoomId === null ? null : rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const loadProfile = useCallback(async () => {
    if (!auth) return;
    try {
      const data = await request<Profile>('/profile', {}, auth.token);
      setProfile(data);
    } catch (err) {
      console.error(err);
      showToast('error', err instanceof Error ? err.message : 'Не удалось загрузить профиль');
    }
  }, [auth, showToast]);

  const loadRooms = useCallback(async (preferredRoomId?: number, silent = false) => {
    if (!auth) return;
    if (!silent) setLoadingRooms(true);

    try {
      const data = await request<Room[]>('/rooms', {}, auth.token);
      setRooms((previous) => {
        if (silent) {
          const previousStatuses = new Map(previous.map((room) => [room.id, room.status]));
          const drawnRoom = data.find((room) => previousStatuses.get(room.id) === 'OPEN' && room.status === 'DRAWN');
          if (drawnRoom) {
            showToast('success', `В комнате "${drawnRoom.name}" проведена жеребьевка`);
          }
        }
        return data;
      });
      setSelectedRoomId((current) => preferredRoomId ?? current ?? data[0]?.id ?? null);
    } catch (err) {
      console.error(err);
      if (!silent) {
        showToast('error', err instanceof Error ? err.message : 'Не удалось загрузить комнаты');
      }
    } finally {
      if (!silent) setLoadingRooms(false);
    }
  }, [auth, showToast]);

  useEffect(() => {
    if (!auth) return;
    void loadProfile();
    void loadRooms();
  }, [auth, loadProfile, loadRooms]);

  useEffect(() => {
    if (!auth) return;
    const timerId = window.setInterval(() => {
      void loadRooms(undefined, true);
    }, 7000);
    return () => window.clearInterval(timerId);
  }, [auth, loadRooms]);

  useEffect(() => {
    setAssignment(null);
    if (!auth || selectedRoom?.status !== 'DRAWN') return;
    request<MyAssignment>(`/rooms/${selectedRoom.id}/my-assignment`, {}, auth.token)
      .then(setAssignment)
      .catch((err) => {
        console.error(err);
        showToast('error', err instanceof Error ? err.message : 'Не удалось загрузить получателя');
      });
  }, [auth, selectedRoom?.id, selectedRoom?.status, showToast]);

  useEffect(() => {
    if (auth && inviteCode) {
      setView('join');
    }
  }, [auth, inviteCode]);

  function saveAuth(nextAuth: AuthResponse) {
    setAuth(nextAuth);
    sessionStorage.setItem('secret-santa-auth', JSON.stringify(nextAuth));
  }

  function updateStoredAuth(nextProfile: Profile) {
    setProfile(nextProfile);
    setAuth((current) => {
      if (!current) return current;
      const nextAuth = {
        ...current,
        token: nextProfile.token ?? current.token,
        login: nextProfile.login,
        displayName: nextProfile.displayName,
        avatarUrl: nextProfile.avatarUrl
      };
      sessionStorage.setItem('secret-santa-auth', JSON.stringify(nextAuth));
      return nextAuth;
    });
  }

  function logout() {
    setAuth(null);
    setProfile(null);
    setRooms([]);
    setSelectedRoomId(null);
    setAssignment(null);
    setView('dashboard');
    sessionStorage.removeItem('secret-santa-auth');
    showToast('info', 'Вы вышли из аккаунта');
  }

  function openRoom(roomId: number) {
    setSelectedRoomId(roomId);
    setView('room');
  }

  if (!auth) {
    return (
      <>
        <AuthPage onAuth={saveAuth} onToast={showToast} />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const visibleProfile: Profile = profile ?? {
    id: auth.userId,
    email: auth.email,
    login: auth.login,
    displayName: auth.displayName,
    avatarUrl: auth.avatarUrl,
    token: null
  };

  return (
    <>
      <AppLayout
        profile={visibleProfile}
        activeView={view}
        onDashboard={() => setView('dashboard')}
        onCreate={() => setCreateOpen(true)}
        onProfile={() => setView('profile')}
        onLogout={logout}
      >
        {view === 'join' && inviteCode ? (
          <JoinPage
            token={auth.token}
            inviteCode={inviteCode}
            onToast={showToast}
            onJoined={(room) => {
              window.history.replaceState({}, '', '/');
              setRooms((current) => current.some((item) => item.id === room.id)
                ? current.map((item) => item.id === room.id ? room : item)
                : [room, ...current]);
              openRoom(room.id);
            }}
          />
        ) : view === 'profile' ? (
          <ProfilePage
            token={auth.token}
            profile={visibleProfile}
            onSaved={updateStoredAuth}
            onToast={showToast}
          />
        ) : view === 'room' && selectedRoom ? (
          <RoomPage
            room={selectedRoom}
            token={auth.token}
            currentUserId={auth.userId}
            assignment={assignment}
            onChanged={async (preferredRoomId) => loadRooms(preferredRoomId)}
            onDeleted={(roomId) => {
              setRooms((current) => current.filter((room) => room.id !== roomId));
              setSelectedRoomId(null);
              setAssignment(null);
              setView('dashboard');
            }}
            onToast={showToast}
          />
        ) : (
          <DashboardPage
            profile={visibleProfile}
            rooms={rooms}
            loading={loadingRooms}
            onCreateRoom={() => setCreateOpen(true)}
            onOpenRoom={openRoom}
          />
        )}
      </AppLayout>

      {createOpen && (
        <CreateRoomModal
          token={auth.token}
          onClose={() => setCreateOpen(false)}
          onToast={showToast}
          onCreated={(room) => {
            setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
            openRoom(room.id);
          }}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

function readStoredAuth(): AuthResponse | null {
  const value = sessionStorage.getItem('secret-santa-auth');
  if (!value) return null;

  try {
    return JSON.parse(value) as AuthResponse;
  } catch {
    sessionStorage.removeItem('secret-santa-auth');
    return null;
  }
}
