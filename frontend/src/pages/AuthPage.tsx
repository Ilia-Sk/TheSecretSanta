import { FormEvent, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Gift, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import type { AuthResponse } from '../api';
import { request } from '../api';
import { AmbientLayer, PremiumGiftObject } from '../components/visual';
import { Button, Field, IconButton, InlineError } from '../components/ui';
import { useCursorScene } from '../hooks/useCursorScene';
import type { AuthMode } from '../types';

export function AuthPage({
  onAuth,
  onToast,
  invitePending = false
}: {
  onAuth: (auth: AuthResponse) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  invitePending?: boolean;
}) {
  const sceneRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<AuthMode>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const resetToken = new URLSearchParams(window.location.search).get('token');
  useCursorScene(sceneRef);

  useEffect(() => {
    if (window.location.pathname === '/reset-password' && resetToken) {
      setMode('reset');
    }
  }, [resetToken]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const login = String(form.get('login') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const displayName = String(form.get('displayName') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      const auth = await request<AuthResponse>(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(mode === 'login'
          ? { login, password }
          : { email, password, displayName })
      });
      onToast('success', mode === 'login' ? 'Вы вошли в аккаунт' : 'Аккаунт создан');
      onAuth(auth);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось выполнить вход';
      console.error(err);
      setError(message);
      onToast('error', message);
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      await request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: String(form.get('email') ?? '').trim() })
      });
      onToast('info', 'Если email зарегистрирован, письмо для восстановления отправлено');
      setMode('login');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось отправить письмо';
      console.error(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: String(form.get('password') ?? '') })
      });
      window.history.replaceState({}, '', '/');
      onToast('success', 'Пароль обновлен. Теперь можно войти');
      setMode('login');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось изменить пароль';
      console.error(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page cinematic-scene" ref={sceneRef}>
      <section className="auth-hero">
        <AmbientLayer />
        <div className="cursor-light" aria-hidden="true" />
        <div className="depth-layer depth-back" aria-hidden="true" />
        <div className="depth-layer depth-mid" aria-hidden="true" />
        <PremiumGiftObject className="auth-gift" />
        <div className="hero-content premium-copy">
          <div className="hero-kicker"><Sparkles size={16} /> Приглашение</div>
          <h1 aria-label="The Secret Santa">
            <span>Тайна,</span>
            <span><em>завернутая</em></span>
            <span>в подарок</span>
          </h1>
          <p className="text-reveal">
            <span>Соберите близких, задайте бюджет</span>
            <span>и доверьте жребию самое приятное.</span>
          </p>
          <p className="hero-subcopy">Создавайте комнаты, приглашайте друзей и проводите жеребьевку в атмосфере тихого зимнего света.</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-logo">
            <span><Gift size={22} /></span>
            <div>
              <strong>{mode === 'login' ? 'С возвращением' : 'Добро пожаловать'}</strong>
              <small>{mode === 'register' ? 'Создайте аккаунт для первой комнаты' : 'Войдите, чтобы продолжить'}</small>
            </div>
          </div>

          {(mode === 'login' || mode === 'register') && (
            <div className="mode-switch" role="tablist" aria-label="Режим авторизации">
              <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(null); }}>
                Вход
              </button>
              <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(null); }}>
                Регистрация
              </button>
            </div>
          )}

          <InlineError message={error} />
          {invitePending && (mode === 'login' || mode === 'register') && (
            <p className="auth-invite-notice">После {mode === 'login' ? 'входа' : 'регистрации'} вы продолжите присоединение к комнате.</p>
          )}

          {mode === 'forgot' ? (
            <form className="animated-form" onSubmit={submitForgotPassword}>
              <Field label="Email" name="email" type="email" placeholder="name@example.com" autoComplete="email" required />
              <Button loading={loading} type="submit"><Mail size={17} />Отправить письмо</Button>
              <button className="text-link" type="button" onClick={() => setMode('login')}>Вернуться ко входу</button>
            </form>
          ) : mode === 'reset' ? (
            <form className="animated-form" onSubmit={submitResetPassword}>
              <PasswordField visible={passwordVisible} onToggle={() => setPasswordVisible((value) => !value)} autoComplete="new-password" />
              <Button loading={loading} type="submit"><LockKeyhole size={17} />Сменить пароль</Button>
            </form>
          ) : (
            <form className="animated-form" onSubmit={submitAuth}>
              {mode === 'login' ? (
                <Field label="Имя и фамилия" name="login" placeholder="Анна Иванова" autoComplete="name" required />
              ) : (
                <>
                  <Field label="Имя и фамилия" name="displayName" placeholder="Анна Иванова" maxLength={120} autoComplete="name" required />
                  <Field label="Email" name="email" type="email" placeholder="name@example.com" autoComplete="email" required />
                </>
              )}
              <PasswordField
                visible={passwordVisible}
                onToggle={() => setPasswordVisible((value) => !value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'login' ? undefined : 6}
                placeholder={mode === 'login' ? 'Введите пароль' : undefined}
              />
              <Button loading={loading} type="submit">
                <UserRound size={17} />
                {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
              </Button>
              {mode === 'login' && (
                <button className="text-link" type="button" onClick={() => { setMode('forgot'); setError(null); }}>
                  Забыли пароль?
                </button>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function PasswordField({
  visible,
  onToggle,
  autoComplete,
  minLength = 6,
  placeholder = 'Минимум 6 символов'
}: {
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  minLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="field password-field">
      <span>Пароль</span>
      <div className="password-control">
        <input
          name="password"
          type={visible ? 'text' : 'password'}
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
        <IconButton type="button" label={visible ? 'Скрыть пароль' : 'Показать пароль'} onClick={onToggle}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </IconButton>
      </div>
    </label>
  );
}
