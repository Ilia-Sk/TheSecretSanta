import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelegramStatus } from '../api';
import { request } from '../api';

/** The server's one-time link lives 30 minutes; renew it a bit earlier. */
const LINK_REFRESH_MS = 25 * 60_000;

/** Inside Telegram's own browser a t.me link must replace the page, not open a new tab. */
function insideTelegram() {
  return /Telegram/i.test(navigator.userAgent) || 'TelegramWebviewProxy' in window;
}

/**
 * Telegram link state + "connect" flow. The one-time deep link is fetched in
 * advance, so the button opens the bot right away: no blank tab is created
 * first (inside Telegram's browser that blank tab hung over the chat and froze
 * the site). After opening, polls until the user has pressed Start in the bot.
 */
export function useTelegram(token: string, onLinked?: () => void) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
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

  const fetchLink = useCallback(async () => {
    const { url } = await request<{ url: string }>('/telegram/link', { method: 'POST' }, token);
    setLinkUrl(url);
    return url;
  }, [token]);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  // Keep a fresh link ready while the account is not linked yet.
  const needsLink = Boolean(status?.enabled && !status.linked);
  useEffect(() => {
    if (!needsLink) return;
    fetchLink().catch(() => setLinkUrl(null));
    const id = window.setInterval(() => fetchLink().catch(() => setLinkUrl(null)), LINK_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [needsLink, fetchLink]);

  const waitForStart = useCallback(() => {
    setWaiting(true);
    const startedAt = Date.now();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      if (document.hidden) return;
      const next = await refresh();
      if (next?.linked || Date.now() - startedAt > 5 * 60_000) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setWaiting(false);
        if (next?.linked) onLinked?.();
      }
    }, 2500);
  }, [refresh, onLinked]);

  // Coming back from the bot: check at once instead of waiting for the next poll.
  useEffect(() => {
    if (!waiting) return;
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [waiting, refresh]);

  const open = useCallback((url: string) => {
    if (insideTelegram()) {
      window.location.href = url;
    } else if (!window.open(url, '_blank', 'noopener')) {
      window.location.href = url;
    }
  }, []);

  const connect = useCallback(async () => {
    // Prepared link: open synchronously, still inside the click (no popup blocker, no blank tab).
    const url = linkUrl ?? (await fetchLink());
    open(url);
    waitForStart();
  }, [linkUrl, fetchLink, open, waitForStart]);

  const disconnect = useCallback(async () => {
    const next = await request<TelegramStatus>('/telegram', { method: 'DELETE' }, token);
    setStatus(next);
  }, [token]);

  return { status, waiting, connect, disconnect, refresh };
}
