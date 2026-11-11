import { isClerkAPIResponseError } from '@clerk/react/errors';

/** Clerk is switched on when the publishable key is set (frontend/.env.local → VITE_CLERK_PUBLISHABLE_KEY). */
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || '';
export const clerkEnabled = CLERK_PUBLISHABLE_KEY.startsWith('pk_');

/** Path Clerk returns to after Google sign-in when the session still needs a step (see SsoCallback). */
export const SSO_CALLBACK_PATH = '/sso-callback';

type ClerkGlobal = { signOut?: () => Promise<unknown> };

/** Ends the Clerk session too, otherwise the next visit would sign the user straight back in. */
export async function signOutOfClerk() {
  const clerk = (window as Window & { Clerk?: ClerkGlobal }).Clerk;
  try {
    await clerk?.signOut?.();
  } catch (err) {
    console.warn('Clerk sign-out failed', err);
  }
}

/** Machine-readable Clerk error code ("form_password_incorrect", …). */
export function clerkErrorCode(error: unknown): string | undefined {
  if (isClerkAPIResponseError(error)) return error.errors[0]?.code;
  if (error && typeof error === 'object' && 'code' in error) return String((error as { code: unknown }).code);
  return undefined;
}

const messages: Record<string, string> = {
  form_identifier_not_found: 'Аккаунт с таким email не найден',
  form_password_incorrect: 'Неверный пароль',
  form_password_or_identifier_incorrect: 'Неверный email или пароль',
  strategy_for_user_invalid: 'Этот аккаунт создан через Google — войдите через Google',
  form_identifier_exists: 'Аккаунт с этим email уже есть — войдите',
  form_identifier_exists__email_address: 'Аккаунт с этим email уже есть — войдите',
  form_password_pwned: 'Этот пароль есть в базах утечек — придумайте другой',
  form_password_pwned__sign_in: 'Этот пароль есть в базах утечек — восстановите доступ через «Забыли пароль?»',
  form_password_length_too_short: 'Пароль слишком короткий — минимум 8 символов',
  form_password_not_strong_enough: 'Пароль слишком простой — добавьте цифры или буквы другого регистра',
  form_password_validation_failed: 'Неверный пароль',
  form_param_format_invalid__email_address: 'Проверьте email — похоже, в нём опечатка',
  form_param_format_invalid: 'Проверьте правильность заполнения',
  form_param_nil: 'Заполните все поля',
  form_code_incorrect: 'Неверный код',
  verification_expired: 'Код устарел — отправьте новый',
  verification_failed: 'Слишком много попыток — отправьте новый код',
  too_many_requests: 'Слишком много попыток — подождите минуту',
  session_exists: 'Вы уже вошли',
  captcha_invalid: 'Не удалось пройти проверку от ботов — обновите страницу',
  captcha_unavailable: 'Проверка от ботов не загрузилась — отключите блокировщик рекламы для этого сайта',
  network_error: 'Нет связи с сервером входа — проверьте интернет',
  factor_not_found: 'Подтверждение по коду недоступно для этого аккаунта'
};

/** User-facing Russian message for a Clerk error. */
export function clerkErrorMessage(error: unknown, fallback = 'Не удалось выполнить вход'): string {
  const code = clerkErrorCode(error);
  if (code === 'form_password_length_too_short' && isClerkAPIResponseError(error)) {
    // The minimum comes from the Clerk Dashboard (Password settings), not from us.
    const min = /\d+/.exec(error.errors[0]?.longMessage ?? '')?.[0] ?? '8';
    return `Пароль слишком короткий — в настройках Clerk минимум ${min} символов`;
  }
  if (code && messages[code]) return messages[code];
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    return first?.longMessage || first?.message || fallback;
  }
  return fallback;
}
