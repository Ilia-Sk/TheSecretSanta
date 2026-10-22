import { FormEvent, useEffect, useRef, useState } from 'react';
import { Ban, ChevronDown, Eye, EyeOff, LockKeyhole, Mail, Shuffle, Sparkles, Ticket, UserRound, Users } from 'lucide-react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { CalendarDays, Gift } from 'lucide-react';
import type { AuthResponse } from '../api';
import { request } from '../api';
import { BrandMark } from '../components/layout';
import {
  AnimatedShinyText,
  BlurFade,
  BorderBeam,
  ScrollProgress,
  TextReveal
} from '../components/magicui';
import { BackgroundPaths, ContainerScroll, InteractiveHoverButton, LiquidButton, TextRotate } from '../components/twentyfirst';
import { CubeGift, Gift3D, GiftPile } from '../components/visual';
import { Button, Card, Field, IconButton, InlineError, Segmented } from '../components/ui';
import { useHeroDepth, useParallax } from '../hooks/motion';
import type { AuthMode } from '../types';

const storySteps = [
  {
    title: 'Создайте комнату.',
    text: 'Название, дата праздника и бюджет. Пара секунд — и площадка для обмена готова.',
    tint: 'rgba(245, 198, 107, 0.22)'
  },
  {
    title: 'Пригласите своих.',
    text: 'Отправьте ссылку-приглашение. Каждый добавит пожелания и ссылки на подарки.',
    tint: 'rgba(255, 106, 61, 0.22)'
  },
  {
    title: 'Откройте тайну.',
    text: 'Жеребьевка учитывает ограничения, а каждый видит только своего получателя.',
    tint: 'rgba(52, 195, 143, 0.2)'
  }
];

const statement = 'Никаких бумажек в шапке и подсмотренных имен. Только пожелания, честный жребий и тот самый момент, когда открывается подарок.';

const heroWords = ['Тайна,', 'завернутая'];

export function AuthPage({
  onAuth,
  onToast,
  invitePending = false
}: {
  onAuth: (auth: AuthResponse) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  invitePending?: boolean;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const storyProgress = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const staticStory = Boolean(reduced);
  const [activeStep, setActiveStep] = useState(0);
  const [mode, setMode] = useState<AuthMode>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [navSolid, setNavSolid] = useState(false);
  const resetToken = new URLSearchParams(window.location.search).get('token');

  const giftDepth = useHeroDepth(heroRef);
  const copyParallax = useParallax(heroRef, 120);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (value) => setNavSolid(value > window.innerHeight * 0.6));

  const { scrollYProgress: storyScroll } = useScroll({ target: storyRef, offset: ['start start', 'end end'] });
  useMotionValueEvent(storyScroll, 'change', (value) => {
    storyProgress.current = value;
    setActiveStep(Math.min(storySteps.length - 1, Math.floor(value * storySteps.length * 0.999)));
  });
  const storyTint = useTransform(storyScroll, [0, 0.5, 1], storySteps.map((step) => step.tint));
  const storyGlow = useTransform(storyTint, (tint) => `radial-gradient(60% 60% at 30% 50%, ${tint}, transparent 70%)`);

  useEffect(() => {
    if (window.location.pathname === '/reset-password' && resetToken) {
      setMode('reset');
    }
  }, [resetToken]);

  function focusAuth(nextMode?: AuthMode) {
    if (nextMode) {
      setMode(nextMode);
      setError(null);
    }
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    window.setTimeout(() => cardRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }), 450);
  }

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

  const cardTitle = mode === 'login'
    ? 'Вход в Secret Santa'
    : mode === 'register'
      ? 'Создайте аккаунт'
      : mode === 'forgot'
        ? 'Восстановление пароля'
        : 'Новый пароль';
  const cardText = mode === 'login'
    ? 'Войдите, чтобы продолжить'
    : mode === 'register'
      ? 'Создайте аккаунт для первой комнаты'
      : mode === 'forgot'
        ? 'Пришлем ссылку для смены пароля на почту'
        : 'Придумайте новый пароль для входа';

  const formMotion = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const }
  };

  return (
    <div className="landing">
      <ScrollProgress className="landing-progress" />
      <header className={`global-nav landing-nav ${navSolid ? 'is-solid' : ''}`}>
        <div className="global-nav-inner glass glass-dark">
          <button className="brand-btn" type="button" onClick={() => focusAuth()}>
            <BrandMark />
            <span>Secret Santa</span>
          </button>
          <div className="global-actions">
            <button type="button" className="nav-link" onClick={() => focusAuth('login')}>Войти</button>
            <LiquidButton type="button" className="tf-liquid-nav" onClick={() => focusAuth('register')}>
              Регистрация
            </LiquidButton>
          </div>
        </div>
      </header>

      <section className="landing-hero dark-section" ref={heroRef}>
        <div className="hero-aurora" aria-hidden="true" />
        <BackgroundPaths className="hero-paths" count={48} angle={-10} />
        <div className="landing-hero-grid">
          <motion.div className="landing-hero-copy" style={copyParallax}>
            <motion.span
              className="hero-kicker glass glass-dark"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <Sparkles size={15} />
              <AnimatedShinyText>Тайный обмен подарками</AnimatedShinyText>
            </motion.span>
            <h1 className="hero-title" aria-label="Тайна, завернутая в подарок">
              {heroWords.map((word, index) => (
                <span className="line" key={word} aria-hidden="true">
                  <motion.span
                    initial={{ opacity: 0, y: '105%', rotateX: -50 }}
                    animate={{ opacity: 1, y: '0%', rotateX: 0 }}
                    transition={{ duration: 1.1, delay: 0.1 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
              <span className="line" aria-hidden="true">
                <motion.span
                  className="hero-rotate-line"
                  initial={{ opacity: 0, y: '105%' }}
                  animate={{ opacity: 1, y: '0%' }}
                  transition={{ duration: 1.1, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
                >
                  в&nbsp;<TextRotate texts={['подарок.', 'сюрприз.', 'праздник.']} className="serif-accent" elementClassName="gradient-text" />
                </motion.span>
              </span>
            </h1>
            <motion.p
              className="hero-lead"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              Соберите близких, задайте бюджет и доверьте жребию самое приятное.
            </motion.p>
            <motion.div className="landing-hero-gift" style={giftDepth}>
              <Gift3D className="hero-gift" interactive={false} />
            </motion.div>
          </motion.div>

          <motion.div
            className="auth-card glass-light"
            ref={cardRef}
            id="auth"
            initial={{ opacity: 0, y: 50, rotateX: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.25 }}
            style={{ transformPerspective: 1200 }}
          >
            <BorderBeam size={140} duration={9} />
            <div className="auth-card-head">
              <BrandMark size={20} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={mode} {...formMotion} className="auth-card-titles">
                  <h2>{cardTitle}</h2>
                  <p>{cardText}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {(mode === 'login' || mode === 'register') && (
              <Segmented
                label="Режим авторизации"
                layoutId="auth-mode"
                value={mode}
                onChange={(next) => { setMode(next); setError(null); }}
                options={[{ value: 'login', label: 'Вход' }, { value: 'register', label: 'Регистрация' }]}
              />
            )}

            <InlineError message={error} />
            {invitePending && (mode === 'login' || mode === 'register') && (
              <p className="auth-invite-notice"><Ticket size={16} /> После {mode === 'login' ? 'входа' : 'регистрации'} вы продолжите присоединение к комнате.</p>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {mode === 'forgot' ? (
                <motion.form className="auth-form" key="forgot" onSubmit={submitForgotPassword} {...formMotion}>
                  <Field label="Email" name="email" type="email" placeholder="name@example.com" autoComplete="email" required />
                  <Button loading={loading} type="submit" variant="accent" className="btn-block"><Mail size={17} />Отправить письмо</Button>
                  <button className="text-link" type="button" onClick={() => setMode('login')}>Вернуться ко входу</button>
                </motion.form>
              ) : mode === 'reset' ? (
                <motion.form className="auth-form" key="reset" onSubmit={submitResetPassword} {...formMotion}>
                  <PasswordField visible={passwordVisible} onToggle={() => setPasswordVisible((value) => !value)} autoComplete="new-password" />
                  <Button loading={loading} type="submit" variant="accent" className="btn-block"><LockKeyhole size={17} />Сменить пароль</Button>
                </motion.form>
              ) : (
                <motion.form className="auth-form" key={mode} onSubmit={submitAuth} {...formMotion}>
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
                  <Button loading={loading} type="submit" variant="accent" className="btn-block">
                    <UserRound size={17} />
                    {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                  </Button>
                  {mode === 'login' && (
                    <button className="text-link" type="button" onClick={() => { setMode('forgot'); setError(null); }}>
                      Забыли пароль?
                    </button>
                  )}
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
        <motion.button
          type="button"
          className="scroll-cue"
          onClick={() => storyRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}
          animate={reduced ? undefined : { y: [0, 5, 0] }}
          transition={{ duration: 1.8, repeat: 2, ease: 'easeInOut', delay: 2 }}
        >
          Как это работает <ChevronDown size={16} />
        </motion.button>
      </section>

      <section className={`story dark-section ${staticStory ? 'is-static' : ''}`} ref={storyRef} aria-label="Как это работает">
        <motion.div className="story-glow" style={staticStory ? undefined : { background: storyGlow }} aria-hidden="true" />
        <div className="story-sticky">
          <div className="story-visual">
            <Gift3D className="story-gift" progressRef={storyProgress} autoRotate={staticStory} interactive={false} />
          </div>
          <div className="story-steps">
            <span className="eyebrow">Как это работает · глава {activeStep + 1} из {storySteps.length}</span>
            {staticStory ? (
              storySteps.map((step, index) => (
                <article key={step.title} className="story-step">
                  <span className="story-index">0{index + 1}</span>
                  <h2>{step.title}</h2>
                  <p>{step.text}</p>
                </article>
              ))
            ) : (
              <AnimatePresence mode="wait">
                <motion.article
                  key={activeStep}
                  className="story-step"
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="story-index">0{activeStep + 1}</span>
                  <h2>{storySteps[activeStep].title}</h2>
                  <p>{storySteps[activeStep].text}</p>
                </motion.article>
              </AnimatePresence>
            )}
            {!staticStory && (
              <div className="story-progress" aria-hidden="true">
                <ScrollProgress progress={storyScroll} className="story-progress-bar" />
                <div className="story-dots">
                  {storySteps.map((step, index) => (
                    <span key={step.title} className={index <= activeStep ? 'is-done' : ''} />
                  ))}
                </div>
              </div>
            )}
            <InteractiveHoverButton type="button" tone="dark" onClick={() => focusAuth('register')}>Начать бесплатно</InteractiveHoverButton>
          </div>
        </div>
      </section>

      <section className="preview-section">
        <ContainerScroll
          title={(
            <>
              <span className="eyebrow">Внутри приложения</span>
              <h2>Вся комната — <span className="serif-accent">на одном экране.</span></h2>
            </>
          )}
        >
          <div className="mock-app" aria-hidden="true">
            <div className="mock-nav"><span className="brand-mark"><Gift size={14} /></span><b>Secret Santa</b><i /><i /><i /><span className="mock-pill">Создать</span></div>
            <div className="mock-hero">
              <div>
                <span className="mock-eyebrow">Ближайшее событие</span>
                <strong>Новогодний обмен</strong>
                <span className="mock-count">74<small> дня до праздника</small></span>
                <span className="mock-meta"><CalendarDays size={13} /> 28 декабря · 6 участников · 3 000 ₽</span>
              </div>
              <CubeGift size={92} tone="red" />
            </div>
            <div className="mock-grid">
              {['Команда дизайна', 'Семья', 'Друзья с района'].map((name, index) => (
                <div className="mock-card" key={name}>
                  <CubeGift size={34} tone={index === 0 ? 'green' : index === 1 ? 'red' : 'graphite'} />
                  <b>{name}</b>
                  <span>{index === 0 ? 'Жеребьевка проведена' : index === 1 ? 'Открыта' : 'Открыта'}</span>
                </div>
              ))}
            </div>
          </div>
        </ContainerScroll>
      </section>

      <section className="statement-section">
        <TextReveal text={statement} />
      </section>

      <section className="bento-section">
        <BlurFade className="section-title centered">
          <div>
            <span className="eyebrow">Возможности</span>
            <h2>Все для идеального <span className="serif-accent">обмена.</span></h2>
          </div>
        </BlurFade>
        <div className="bento">
          <Card className="bento-tile bento-wide bento-wishlist">
            <div className="bento-copy">
              <span className="bento-icon"><Sparkles size={20} /></span>
              <h3>Списки желаний</h3>
              <p>Пожелания и ссылки на подарки. Санта увидит их только после жеребьевки.</p>
            </div>
            <div className="wish-chips" aria-hidden="true">
              {['Книга', 'Кофе в зернах', 'Настольная игра', 'Плед', 'Сертификат'].map((chip, index) => (
                <motion.span
                  key={chip}
                  initial={{ opacity: 0, scale: 0.6, y: 20 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.2 + index * 0.08 }}
                  style={{ '--d': `${30 + (index % 3) * 30}px` } as React.CSSProperties}
                >
                  {chip}
                </motion.span>
              ))}
            </div>
          </Card>
          <Card className="bento-tile bento-dark" delay={0.08}>
            <span className="bento-icon"><LockKeyhole size={20} /></span>
            <h3>Полная тайна</h3>
            <p>Каждый участник видит только своего получателя.</p>
          </Card>
          <Card className="bento-tile" delay={0.04}>
            <span className="bento-icon"><Ban size={20} /></span>
            <h3>Ограничения</h3>
            <p>Задайте, кто кому не может дарить, — жеребьевка учтет.</p>
          </Card>
          <Card className="bento-tile" delay={0.1}>
            <span className="bento-icon"><Mail size={20} /></span>
            <h3>Письма</h3>
            <p>Уведомления о жеребьевке и восстановление пароля по email.</p>
          </Card>
          <Card className="bento-tile" delay={0.16}>
            <span className="bento-icon"><Users size={20} /></span>
            <h3>Для любой компании</h3>
            <p>Семья, друзья или команда — сколько угодно комнат.</p>
          </Card>
          <Card className="bento-tile bento-wide bento-dark bento-invite">
            <div className="bento-copy">
              <span className="bento-icon"><Ticket size={20} /></span>
              <h3>Одна ссылка — и все в комнате</h3>
              <p>Скопируйте приглашение и отправьте в любой мессенджер.</p>
            </div>
            <div className="ticket-3d" aria-hidden="true">
              <motion.div
                className="ticket-face"
                initial={{ rotateX: 40, rotateZ: -12, y: 40, opacity: 0 }}
                whileInView={{ rotateX: 18, rotateZ: -6, y: 0, opacity: 1 }}
                whileHover={{ rotateX: 4, rotateY: -14, rotateZ: -2, scale: 1.04 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 120, damping: 14 }}
              >
                <span>Приглашение</span>
                <strong>Новогодний обмен</strong>
                <small>/join/•••••</small>
              </motion.div>
            </div>
          </Card>
          <Card className="bento-tile" delay={0.08}>
            <span className="bento-icon"><Shuffle size={20} /></span>
            <h3>Честный жребий</h3>
            <p>Одна кнопка, и назначения готовы. Без повторов и подсказок.</p>
          </Card>
        </div>
      </section>

      <section className="final-cta dark-section">
        <BackgroundPaths className="cta-paths" count={36} angle={6} speed={0.7} />
        <BlurFade>
          <h2>Подарки начинаются <span className="serif-accent gradient-text">здесь.</span></h2>
        </BlurFade>
        <BlurFade delay={0.1}>
          <p>Создайте комнату за минуту и пригласите всех, кого любите.</p>
        </BlurFade>
        <BlurFade delay={0.2} className="final-cta-actions">
          <InteractiveHoverButton type="button" tone="gold" onClick={() => focusAuth('register')}>Создать аккаунт</InteractiveHoverButton>
          <Button type="button" variant="light" onClick={() => focusAuth('login')}>Войти</Button>
        </BlurFade>
        <GiftPile className="cta-pile" count={16} width={18} hint="Хватайте и бросайте подарки · клик по пустому месту — ещё подарок" />
      </section>

      <footer className="site-footer landing-footer">
        <div>
          <span>The Secret Santa</span>
          <span>Тайный обмен подарками для друзей, семьи и команды.</span>
        </div>
        <span>Сделано с теплом · {new Date().getFullYear()}</span>
      </footer>
    </div>
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
      <span className="field-label">Пароль</span>
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
