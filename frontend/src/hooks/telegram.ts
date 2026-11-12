import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelegramStatus } from '../api';
import { request } from '../api';

/**
 * Telegram link state + "connect" flow: get a one-time deep link, open the bot,
 * then poll until the user has pressed Start there.
 */
export function useTelegram(token: string, onLinked?: () => void) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await request<TelegramStatus>('/telegram', {}, token);
      setStatus(next);
      return next;
    } catch {
      return null;
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    // Open the tab synchronously (popup blockers), then point it at the bot.
    const tab = window.open('about:blank', '_blank');
    try {
      const { url } = await request<{ url: string }>('/telegram/link', { method: 'POST' }, token);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      throw err;
    }
    setWaiting(true);
    const startedAt = Date.now();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const next = await refresh();
      if (next?.linked || Date.now() - startedAt > 3 * 60_000) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setWaiting(false);
        if (next?.linked) onLinked?.();
      }
    }, 2500);
  }, [refresh, token, onLinked]);

  const disconnect = useCallback(async () => {
    const next = await request<TelegramStatus>('/telegram', { method: 'DELETE' }, token);
    setStatus(next);
  }, [token]);

  return { status, waiting, connect, disconnect, refresh };
}
