import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, Pencil } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth, useSignIn, useSignUp } from '@clerk/react';
import type { AuthResponse } from '../api';
import { ApiRequestError, request } from '../api';
import { Button, Field, IconButton, InlineError } from '../components/ui';
import { clerkErrorCode, clerkErrorMessage, SSO_CALLBACK_PATH } from './clerk';

type Step = 'signIn' | 'signUp' | 'verifyEmail' | 'verifyDevice' | 'forgot' | 'reset' | 'chooseLogin';

const LOGIN_PATTERN = '[\\p{L}\\p{N} ._\\-]{3,60}';
const RESEND_COOLDOWN = 30;

const serverMessages: Record<string, string> = {
  'Name is already taken': 'Этот логин уже занят — выберите другой',
  'Choose a login to finish sign-up': 'Придумайте логин, чтобы закончить регистрацию',
  'Email address is not verified yet': 'Email ещё не подтверждён — введите код из письма',
  'Clerk account has no email address': 'В аккаунте нет email — войдите по email и паролю',
  'Clerk session token is invalid or expired': 'Сессия входа устарела — войдите ещё раз',
  'Clerk is not configured on the server: set CLERK_SECRET_KEY': 'Сервер не настроен: задайте CLERK_SECRET_KEY для бэкенда',
  'Clerk API is unreachable': 'Сервер не может связаться с Clerk — проверьте интернет',
  'Failed to fetch': 'Сервер недоступен — запущен ли бэкенд?'
};

function serverMessage(err: unknown) {
  const message = err instanceof Error ? err.message : '';
  if (serverMessages[message]) return serverMessages[message];
  if (message.startsWith('Name must be')) return 'Логин: от 3 до 60 символов — буквы, цифры, пробел, точка, дефис или подчёркивание';
  return message || 'Не удалось войти';
}

const titles: Record<Step, [string, string]> = {
  signIn: ['Вход', 'Email и пароль. Нет аккаунта — создадим.'],
  signUp: ['Регистрация', 'Осталось придумать логин и пароль'],
  verifyEmail: ['Подтвердите email', 'Мы отправили код на'],
  verifyDevice: ['Подтвердите вход', 'Новое устройство — код отправлен на почту'],
  forgot: ['Восстановление', 'Пришлём код на почту'],
  reset: ['Новый пароль', 'Код из письма и новый пароль'],
  chooseLogin: ['Почти готово', 'Придумайте логин — так вас увидят в комнатах']
};

export function AuthCard({
  onAuth,
  invitePending,
  intent = 'signIn'
}: {
  onAuth: (auth: AuthResponse) => void;
  invitePending?: boolean;
  /** Only changes the first screen's heading: both start with email + password. */
  intent?: 'signIn' | 'signUp';
}) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [step, setStep] = useState<Step>('signIn');
  const [email, setEmail] = useState('');
  // Carried from the first screen into registration, so a new user only has to add a login.
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const exchanging = useRef(false);
  // An old error must not hang over a field the user is already fixing.
  const clearError = () => setError((current) => (current ? null : current));

  useEffect(() => {
    setStep((current) => (current === 'signUp' || current === 'signIn' ? 'signIn' : current));
  }, [intent]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  /** Clerk session → the app's own JWT (POST /api/auth/clerk). */
  async function finishSession(login?: string) {
    if (exchanging.current) return;
    exchanging.current = true;
    setFinishing(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Clerk session token is invalid or expired');
      const auth = await request<AuthResponse>('/auth/clerk', {
        method: 'POST',
        body: JSON.stringify(login ? { login } : {})
      }, token);
      onAuth(auth);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiRequestError && err.code === 'LOGIN_REQUIRED') {
        setStep('chooseLogin');
        setError(err.message === 'Name is already taken' ? serverMessage(err) : null);
      } else {
        setError(serverMessage(err));
      }
    } finally {
      exchanging.current = false;
      setFinishing(false);
    }
  }

  // Signed in with Clerk (just now, after the Google redirect, or on reload) → exchange the session.
  useEffect(() => {
    if (isLoaded && isSignedIn && step !== 'chooseLogin') void finishSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  function go(next: Step) {
    setError(null);
    setPasswordVisible(false);
    setStep(next);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      console.error(err);
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Handles a Clerk error; returns true when it was handled by switching the flow. */
  function handleClerkError(err: unknown, context: 'signIn' | 'signUp' | 'code' | 'forgot'): void {
    const code = clerkErrorCode(err);
    // Full Clerk answer in the console (F12) — handy when a dashboard setting is the cause.
    console.warn(`[clerk] ${context}:`, code, err);
    if (code === 'session_exists') {
      void finishSession();
      return;
    }
    if (context === 'signIn' && code === 'form_identifier_not_found') {
      // No account with this email → registration with the email already filled in.
      go('signUp');
      return;
    }
    if (context === 'signUp' && (code === 'form_identifier_exists' || code === 'form_identifier_exists__email_address')) {
      go('signIn');
      setError(clerkErrorMessage(err));
      return;
    }
    setError(clerkErrorMessage(err));
  }

  async function finalizeSignIn() {
    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) throw finalizeError;
  }

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextEmail = String(form.get('email') ?? '').trim();
    const nextPassword = String(form.get('password') ?? '');
    setEmail(nextEmail);
    setPassword(nextPassword);
    await run(async () => {
      const { error: signInError } = await signIn.password({ emailAddress: nextEmail, password: nextPassword });
      if (signInError) return handleClerkError(signInError, 'signIn');
      if (signIn.status === 'complete') return finalizeSignIn();
      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const { error: sendError } = await signIn.mfa.sendEmailCode();
        if (sendError) return handleClerkError(sendError, 'code');
        setCooldown(RESEND_COOLDOWN);
        go('verifyDevice');
        return;
      }
      setError('Этот способ входа не настроен в Clerk — включите вход по паролю');
    });
  }

  async function submitSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = String(form.get('login') ?? '').trim();
    const nextPassword = String(form.get('password') ?? '');
    setPassword(nextPassword);
    await run(async () => {
      // The login lives in our database; Clerk keeps it in unsafeMetadata until the account is created.
      const { error: signUpError } = await signUp.password({ emailAddress: email, password: nextPassword, unsafeMetadata: { login } });
      if (signUpError) return handleClerkError(signUpError, 'signUp');
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) return handleClerkError(sendError, 'code');
      setCooldown(RESEND_COOLDOWN);
      go('verifyEmail');
    });
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '');
    await run(async () => {
      if (step === 'verifyEmail') {
        const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
        if (verifyError) return handleClerkError(verifyError, 'code');
        if (signUp.status !== 'complete') {
          setError('Clerk просит дополнительные поля — отключите их в Clerk Dashboard (User & authentication)');
          return;
        }
        const { error: finalizeError } = await signUp.finalize();
        if (finalizeError) throw finalizeError;
        return;
      }
      const { error: verifyError } = await signIn.mfa.verifyEmailCode({ code });
      if (verifyError) return handleClerkError(verifyError, 'code');
      if (signIn.status === 'complete') await finalizeSignIn();
    });
  }

  async function resendCode() {
    await run(async () => {
      const { error: sendError } = step === 'verifyEmail'
        ? await signUp.verifications.sendEmailCode()
        : step === 'reset'
          ? await signIn.resetPasswordEmailCode.sendCode()
          : await signIn.mfa.sendEmailCode();
      if (sendError) return handleClerkError(sendError, 'code');
      setCooldown(RESEND_COOLDOWN);
    });
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setEmail(nextEmail);
    await run(async () => {
      const { error: createError } = await signIn.create({ identifier: nextEmail });
      if (createError) return handleClerkError(createError, 'forgot');
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) return handleClerkError(sendError, 'forgot');
      setCooldown(RESEND_COOLDOWN);
      go('reset');
    });
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '').replace(/\s/g, '');
    const newPassword = String(form.get('password') ?? '');
    await run(async () => {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyError) return handleClerkError(verifyError, 'code');
      const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
      if (submitError) return handleClerkError(submitError, 'code');
      if (signIn.status === 'complete') await finalizeSignIn();
    });
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const login = String(new FormData(event.currentTarget).get('login') ?? '').trim();
    await finishSession(login);
  }

  async function continueWithGoogle() {
    await run(async () => {
      const origin = window.location.origin;
      const { error: ssoError } = await signIn.sso({
        strategy: 'oauth_google',
        redirectUrl: `${origin}/`,
        redirectCallbackUrl: `${origin}${SSO_CALLBACK_PATH}`
      });
      if (ssoError) handleClerkError(ssoError, 'signIn');
    });
  }

  const [title, subtitle] = step === 'signIn' && intent === 'signUp'
    ? ['Регистрация', 'Начните с email и пароля']
    : titles[step];
  const passwordToggle = (
    <IconButton type="button" label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setPasswordVisible((value) => !value)}>
      {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
    </IconButton>
  );
  const stepMotion = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const }
  };

  return (
    <div className="auth-card">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} className="auth-step" {...stepMotion}>
          <div className="auth-step-head">
            <h2>{title}</h2>
            {step === 'signUp' ? (
              <button type="button" className="auth-email-chip" onClick={() => go('signIn')} title="Изменить email">
                <span>{email}</span>
                <Pencil size={13} />
              </button>
            ) : (
              <p>{subtitle}{step === 'verifyEmail' && <> <b>{email}</b></>}</p>
            )}
          </div>

          <InlineError message={error} />

          {step === 'signIn' && (
            <form className="auth-form" onInput={clearError} onSubmit={submitSignIn}>
              <Field label="Email" name="email" type="email" defaultValue={email} placeholder="name@example.com" autoComplete="email" required />
              <Field label="Пароль" name="password" type={passwordVisible ? 'text' : 'password'} placeholder="Ваш пароль" autoComplete="current-password" required trailing={passwordToggle} />
              <Button loading={busy} type="submit" variant="accent" className="btn-block">Войти</Button>
              <div className="auth-alt">
                <button type="button" className="btn btn-secondary auth-google" onClick={continueWithGoogle} disabled={busy}>
                  <GoogleIcon />
                  Войти через Google
                </button>
                <button type="button" className="text-link" onClick={() => go('forgot')}>Забыли пароль?</button>
              </div>
            </form>
          )}

          {step === 'signUp' && (
            <form className="auth-form" onInput={clearError} onSubmit={submitSignUp}>
              <Field label="Логин" name="login" placeholder="Как вас увидят в комнатах" autoComplete="username" required minLength={3} maxLength={60} pattern={LOGIN_PATTERN} title="3–60 символов: буквы, цифры, пробел, точка, дефис, подчёркивание" />
              <Field label="Пароль" name="password" type={passwordVisible ? 'text' : 'password'} defaultValue={password} placeholder="Минимум 8 символов" autoComplete="new-password" required minLength={8} trailing={passwordToggle} />
              {/* Clerk bot protection renders its challenge here when needed */}
              <div id="clerk-captcha" />
              <Button loading={busy} type="submit" variant="accent" className="btn-block">Создать аккаунт</Button>
              <div className="auth-alt">
                <button type="button" className="text-link" onClick={() => go('signIn')}><ArrowLeft size={14} /> У меня уже есть аккаунт</button>
              </div>
            </form>
          )}

          {(step === 'verifyEmail' || step === 'verifyDevice') && (
            <form className="auth-form" onInput={clearError} onSubmit={submitCode}>
              <Field label="Код из письма" name="code" className="field-code" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" maxLength={8} required autoFocus />
              <Button loading={busy} type="submit" variant="accent" className="btn-block">Подтвердить</Button>
              <div className="auth-alt">
                <button type="button" className="text-link" onClick={() => go(step === 'verifyEmail' ? 'signUp' : 'signIn')}><ArrowLeft size={14} /> Назад</button>
                <button type="button" className="text-link" onClick={resendCode} disabled={cooldown > 0 || busy}>
                  {cooldown > 0 ? `Новый код через ${cooldown} с` : 'Отправить код ещё раз'}
                </button>
              </div>
            </form>
          )}

          {step === 'forgot' && (
            <form className="auth-form" onInput={clearError} onSubmit={submitForgot}>
              <Field label="Email" name="email" type="email" defaultValue={email} placeholder="name@example.com" autoComplete="email" required />
              <Button loading={busy} type="submit" variant="accent" className="btn-block">Отправить код</Button>
              <div className="auth-alt">
                <button type="button" className="text-link" onClick={() => go('signIn')}><ArrowLeft size={14} /> Назад ко входу</button>
              </div>
            </form>
          )}

          {step === 'reset' && (
            <form className="auth-form" onInput={clearError} onSubmit={submitReset}>
              <Field label="Код из письма" name="code" className="field-code" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" maxLength={8} required />
              <Field label="Новый пароль" name="password" type={passwordVisible ? 'text' : 'password'} placeholder="Минимум 8 символов" autoComplete="new-password" required minLength={8} trailing={passwordToggle} />
              <Button loading={busy} type="submit" variant="accent" className="btn-block">Сохранить и войти</Button>
              <div className="auth-alt">
                <button type="button" className="text-link" onClick={() => go('signIn')}><ArrowLeft size={14} /> Назад</button>
                <button type="button" className="text-link" onClick={resendCode} disabled={cooldown > 0 || busy}>
                  {cooldown > 0 ? `Новый код через ${cooldown} с` : 'Отправить код ещё раз'}
                </button>
              </div>
            </form>
          )}

          {step === 'chooseLogin' && (
            <form className="auth-form" onInput={clearError} onSubmit={submitLogin}>
              <Field label="Логин" name="login" placeholder="Как вас увидят в комнатах" autoComplete="username" required minLength={3} maxLength={60} pattern={LOGIN_PATTERN} title="3–60 символов: буквы, цифры, пробел, точка, дефис, подчёркивание" autoFocus />
              <Button loading={finishing} type="submit" variant="accent" className="btn-block">Продолжить</Button>
            </form>
          )}
        </motion.div>
      </AnimatePresence>

      {invitePending && <p className="auth-invite-notice">После входа вы попадёте в комнату по приглашению</p>}

      <AnimatePresence>
        {finishing && step !== 'chooseLogin' && (
          <motion.div className="auth-finishing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 className="spin" size={22} />
            Входим…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
