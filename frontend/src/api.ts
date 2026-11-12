export type AuthResponse = {
  token: string;
  userId: number;
  email: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
};

export type Participant = {
  participantId: number;
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  owner: boolean;
  wishlist: string | null;
  wishlistLinks: string | null;
};

export type Restriction = {
  id: number;
  giverParticipantId: number;
  giverName: string;
  receiverParticipantId: number;
  receiverName: string;
};

export type Room = {
  id: number;
  name: string;
  description: string | null;
  celebrationDate: string | null;
  giftBudget: number | null;
  inviteCode: string;
  status: 'OPEN' | 'DRAWN' | 'CLOSED';
  ownerId: number;
  owner: boolean;
  participants: Participant[];
  restrictions: Restriction[];
};

export type MyAssignment = {
  receiverUserId: number;
  receiverName: string;
  receiverAvatarUrl: string | null;
  receiverWishlist: string | null;
  receiverWishlistLinks: string | null;
};

export type Profile = {
  id: number;
  email: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  token: string | null;
};

export type InvitePreview = {
  roomId: number;
  name: string;
  description: string | null;
  status: 'OPEN' | 'DRAWN' | 'CLOSED';
};

/** API error with the HTTP status and, for some errors, a machine-readable code (e.g. LOGIN_REQUIRED). */
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const defaultApiUrl = `${window.location.origin}/api`;
const API_URL = import.meta.env.VITE_API_URL ?? defaultApiUrl;

/** A request that got no answer in time (e.g. a connection a phone killed while the app was in the background). */
const REQUEST_TIMEOUT_MS = 15_000;

export async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  // Never wait forever: after a phone app is reopened, requests sent over the old
  // connection can hang with no error, freezing whatever waits for them.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    const timedOut = controller.signal.aborted;
    throw new ApiRequestError(timedOut ? 'Сервер не ответил, попробуйте ещё раз' : 'Нет связи с сервером', 0, timedOut ? 'TIMEOUT' : 'NETWORK');
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiRequestError(payload?.message ?? 'Request failed', response.status, payload?.code);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export async function uploadFile<T>(path: string, file: File, token: string): Promise<T> {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Upload failed');
  }

  return response.json();
}

/* ---------------------------------------------------------------- Chat */

/** One anonymous conversation, from the current user's side. */
export type ChatDialog = {
  id: number;
  roomId: number;
  roomName: string;
  /** SANTA: I write to my recipient. RECIPIENT: I talk to my (anonymous) Santa. */
  role: 'SANTA' | 'RECIPIENT';
  title: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageMine: boolean;
  unread: number;
};

export type ChatMessage = {
  id: number;
  mine: boolean;
  text: string;
  createdAt: string;
  read: boolean;
};

export type TelegramStatus = {
  enabled: boolean;
  linked: boolean;
  botUsername: string | null;
};
