import type { Room } from './api';

export const statusLabels: Record<Room['status'], string> = {
  OPEN: 'Открыта',
  DRAWN: 'Жеребьевка проведена',
  CLOSED: 'Закрыта'
};

export const statusHints: Record<Room['status'], string> = {
  OPEN: 'Можно приглашать участников, редактировать пожелания и настраивать ограничения.',
  DRAWN: 'Каждый участник видит только своего получателя.',
  CLOSED: 'Комната завершена.'
};

export function todayDateInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(value: string | null): string {
  if (!value) return 'Дата не задана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`));
}

export function formatBudget(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'Без бюджета';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCountdown(value: string | null): string {
  if (!value) return 'Дата праздника пока не выбрана';
  const target = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((target - today.getTime()) / 86_400_000);

  if (days < 0) return 'Праздник уже прошел';
  if (days === 0) return 'Праздник сегодня';
  if (days === 1) return 'До праздника 1 день';
  if (days > 1 && days < 5) return `До праздника ${days} дня`;
  return `До праздника ${days} дней`;
}

export function safeExternalHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function splitLinks(value: string | null): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((link) => link.trim())
    .filter(Boolean);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}
