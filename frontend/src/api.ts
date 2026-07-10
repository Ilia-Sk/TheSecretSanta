export type AuthResponse = {
  token: string;
  userId: number;
  email: string;
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
  displayName: string;
  avatarUrl: string | null;
};

export type InvitePreview = {
  roomId: number;
  name: string;
  description: string | null;
  status: 'OPEN' | 'DRAWN' | 'CLOSED';
};

const defaultApiUrl = `${window.location.origin}/api`;
const API_URL = import.meta.env.VITE_API_URL ?? defaultApiUrl;

export async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}
