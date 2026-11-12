import { ArrowUp, Lock, Send } from 'lucide-react';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChatDialog, ChatMessage } from '../api';
import { request } from '../api';
import { useTelegram } from '../hooks/telegram';
import { Avatar, Button } from './ui';

type ToastFn = (type: 'success' | 'error' | 'info', message: string) => void;

const MESSAGE_POLL_MS = 3000;
const DIALOG_POLL_MS = 8000;
const MAX_LENGTH = 2000;

function timeLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** The person (or the anonymous Santa) on the other side, as a round picture. */
function DialogAvatar({ dialog, size = 'md' }: { dialog: ChatDialog; size?: 'sm' | 'md' }) {
  if (dialog.role === 'RECIPIENT') {
    return <span className={`chat-santa-avatar chat-santa-avatar-${size}`} aria-hidden="true">🎅</span>;
  }
  return <Avatar name={dialog.title} avatarUrl={dialog.avatarUrl} size={size === 'sm' ? 'sm' : 'md'} />;
}

/**
 * Anonymous Santa ↔ recipient chat of one room: the two conversations on the
 * left, messages on the right. New messages arrive by light polling; the same
 * conversations are mirrored in the Telegram bot when it is connected.
 */
export function ChatPanel({ roomId, token, onToast }: { roomId: number; token: string; onToast: ToastFn }) {
  const [dialogs, setDialogs] = useState<ChatDialog[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const telegram = useTelegram(token, () => onToast('success', 'Telegram подключён — сообщения будут приходить туда'));

  const active = useMemo(() => dialogs?.find((d) => d.id === activeId) ?? null, [dialogs, activeId]);

  const loadDialogs = useCallback(async () => {
    try {
      const next = await request<ChatDialog[]>(`/rooms/${roomId}/chats`, {}, token);
      setDialogs(next);
      setActiveId((current) => current ?? (next.find((d) => d.unread > 0) ?? next[0])?.id ?? null);
    } catch (err) {
      setDialogs((current) => current ?? []);
      console.error(err);
    }
  }, [roomId, token]);

  useEffect(() => {
    void loadDialogs();
    const id = window.setInterval(() => {
      if (!document.hidden) void loadDialogs();
    }, DIALOG_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadDialogs]);

  // Full history when a conversation opens, then only what is new.
  useEffect(() => {
    if (activeId === null) return;
    let cancelled = false;
    let lastId: number | null = null;
    stickToBottom.current = true;
    setLoadingMessages(true);
    setMessages([]);

    const fetchMessages = async () => {
      const query = lastId === null ? '' : `?after=${lastId}`;
      const next = await request<ChatMessage[]>(`/chats/${activeId}/messages${query}`, {}, token);
      if (cancelled) return;
      if (next.length) {
        lastId = next[next.length - 1].id;
        setMessages((current) => {
          const known = new Set(current.map((m) => m.id));
          return [...current, ...next.filter((m) => !known.has(m.id))];
        });
        setDialogs((current) => current?.map((d) => (d.id === activeId ? { ...d, unread: 0 } : d)) ?? current);
      }
    };

    fetchMessages()
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setLoadingMessages(false));
    const id = window.setInterval(() => {
      if (!document.hidden) fetchMessages().catch(() => undefined);
    }, MESSAGE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeId, token]);

  // Keep the view pinned to the newest message unless the user scrolled up to read.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !active || sending) return;
    setSending(true);
    try {
      const saved = await request<ChatMessage>(`/chats/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }, token);
      stickToBottom.current = true;
      setMessages((current) => (current.some((m) => m.id === saved.id) ? current : [...current, saved]));
      setDialogs((current) => current?.map((d) => (d.id === active.id
        ? { ...d, lastMessage: saved.text, lastMessageAt: saved.createdAt, lastMessageMine: true }
        : d)) ?? current);
      setDraft('');
      inputRef.current?.focus();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  // Auto-grow the composer up to ~6 lines.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft]);

  async function connectTelegram() {
    try {
      await telegram.connect();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Не удалось подключить Telegram');
    }
  }

  if (dialogs === null) {
    return <div className="chat-shell chat-loading" aria-busy="true"><span className="skeleton chat-skeleton" /></div>;
  }

  if (dialogs.length === 0) {
    return (
      <div className="chat-shell chat-empty-room">
        <span className="chat-empty-icon" aria-hidden="true">💬</span>
        <h3>Чат откроется после жеребьёвки</h3>
        <p>Тогда здесь появятся два диалога: с вашим получателем и с вашим Тайным Сантой.</p>
      </div>
    );
  }

  const groups: Array<{ day: string; items: ChatMessage[] }> = [];
  for (const message of messages) {
    const day = dayLabel(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(message);
    else groups.push({ day, items: [message] });
  }

  const showTelegram = Boolean(telegram.status?.enabled && !telegram.status.linked);

  return (
    <div className={`chat-wrap ${showTelegram ? 'has-telegram' : ''}`}>
      {showTelegram && (
        <div className="chat-telegram">
          <span className="chat-telegram-icon" aria-hidden="true"><Send size={18} /></span>
          <div>
            <strong>Отвечайте прямо из Telegram</strong>
            <p>Бот перешлёт сообщения сюда и обратно — Санта останется анонимным.</p>
          </div>
          <Button variant="secondary" onClick={connectTelegram} loading={telegram.waiting}>
            {telegram.waiting ? 'Ждём «Start» в боте…' : 'Подключить'}
          </Button>
        </div>
      )}

      <div className="chat-shell">
        <nav className="chat-dialogs" aria-label="Диалоги">
          {dialogs.map((dialog) => (
            <button
              key={dialog.id}
              type="button"
              className={`chat-dialog ${dialog.id === activeId ? 'is-active' : ''}`}
              onClick={() => setActiveId(dialog.id)}
              aria-current={dialog.id === activeId ? 'true' : undefined}
            >
              <DialogAvatar dialog={dialog} />
              <span className="chat-dialog-text">
                <span className="chat-dialog-role">{dialog.role === 'SANTA' ? 'Ваш получатель' : 'Ваш Санта'}</span>
                <strong>{dialog.title}</strong>
                <span className="chat-dialog-last">
                  {dialog.lastMessage ? `${dialog.lastMessageMine ? 'Вы: ' : ''}${dialog.lastMessage}` : 'Сообщений пока нет'}
                </span>
              </span>
              {dialog.unread > 0 && <span className="chat-unread" aria-label={`Непрочитанных: ${dialog.unread}`}>{dialog.unread}</span>}
            </button>
          ))}
        </nav>

        {active && (
          <section className="chat-pane" aria-label={`Чат: ${active.title}`}>
            <header className="chat-pane-head">
              <DialogAvatar dialog={active} size="sm" />
              <div>
                <strong>{active.title}</strong>
                <span>
                  <Lock size={12} />
                  {active.role === 'SANTA' ? 'Вы пишете анонимно — получатель видит «Тайный Санта»' : 'Санта анонимен — вы не узнаете, кто это'}
                </span>
              </div>
            </header>

            <div className="chat-messages" ref={listRef} onScroll={onScroll} aria-live="polite">
              {loadingMessages && messages.length === 0 ? (
                <div className="chat-messages-empty"><span className="skeleton chat-skeleton" /></div>
              ) : messages.length === 0 ? (
                <div className="chat-messages-empty">
                  <p>
                    {active.role === 'SANTA'
                      ? 'Спросите о размере, любимом цвете или о том, что точно не дарить. Ваше имя никто не увидит.'
                      : 'Здесь появятся вопросы от вашего Санты. Можно написать первым — например, подсказать с подарком.'}
                  </p>
                </div>
              ) : (
                groups.map((group) => (
                  <div className="chat-day" key={group.day}>
                    <span className="chat-day-label">{group.day}</span>
                    {group.items.map((message) => (
                      <div key={message.id} className={`chat-bubble ${message.mine ? 'is-mine' : 'is-theirs'}`}>
                        <p>{message.text}</p>
                        <time dateTime={message.createdAt}>
                          {timeLabel(message.createdAt).split(', ').pop()}
                          {message.mine && <span className="chat-read">{message.read ? ' · прочитано' : ''}</span>}
                        </time>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <form className="chat-composer" onSubmit={send}>
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={MAX_LENGTH}
                placeholder={active.role === 'SANTA' ? `Написать: ${active.title}` : 'Написать Тайному Санте'}
                aria-label="Сообщение"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
              />
              <button type="submit" className="chat-send" disabled={!draft.trim() || sending} aria-label="Отправить">
                <ArrowUp size={19} strokeWidth={2.4} />
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
