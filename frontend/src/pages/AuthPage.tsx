import { useEffect, useRef, useState } from 'react';
import { Ban, LockKeyhole, Mail, Shuffle, Sparkles, Ticket, Users } from 'lucide-react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { CalendarDays } from 'lucide-react';
import type { AuthResponse } from '../api';
import { AuthCard } from '../auth/AuthCard';
import { clerkEnabled } from '../auth/clerk';
import { SiteFooter } from '../components/layout';
import { Logo } from '../components/Logo';
import { BlurFade } from '../components/magicui';
import { Snowfall } from '../components/Snowfall';
import { ContainerScroll, TextRotate } from '../components/twentyfirst';
import { CubeGift, Gift3D, GiftPile } from '../components/visual';
import { Button, Card } from '../components/ui';
import { useHeroDepth } from '../hooks/motion';

const storySteps = [
  {
    title: 'Создайте комнату',
    text: 'Название, дата праздника и бюджет — и площадка для обмена готова.',
    gift: 0.12
  },
  {
    title: 'Пригласите своих',
    text: 'Отправьте ссылку-приглашение. Каждый добавит пожелания и ссылки на подарки.',
    gift: 0.48
  },
  {
    title: 'Откройте тайну',
    text: 'Жеребьёвка учтёт ограничения, а каждый увидит только своего получателя.',
    gift: 1
  }
];
const STEP_MS = 3600;

const statement = 'Никаких бумажек в шапке и подсмотренных имён. Только пожелания, честный жребий и тот самый момент, когда открывается подарок.';

const heroWords = ['Тайна,', 'завернутая'];

export function AuthPage({
  onAuth,
  invitePending = false
}: {
  onAuth: (auth: AuthResponse) => void;
  onToast?: (type: 'success' | 'error' | 'info', message: string) => void;
  invitePending?: boolean;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [intent, setIntent] = useState<'signIn' | 'signUp'>(() => (
    new URLSearchParams(window.location.search).get('auth') === 'signup' ? 'signUp' : 'signIn'
  ));
  const giftDepth = useHeroDepth(heroRef);

  function focusAuth(next: 'signIn' | 'signUp') {
    setIntent(next);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    window.setTimeout(() => cardRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }), 450);
  }

  return (
    <div className="landing">
      <header className="landing-header">
        <button className="logo-btn" type="button" onClick={() => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })} aria-label="Secret Santa">
          <Logo />
        </button>
        <div className="landing-header-actions">
          <Button variant="outline" onClick={() => focusAuth('signIn')}>Войти</Button>
          <Button variant="accent" onClick={() => focusAuth('signUp')}>Регистрация</Button>
        </div>
      </header>

      <section className="landing-hero dark-section" ref={heroRef}>
        <div className="hero-aurora" aria-hidden="true" />
        <Snowfall />
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <h1 className="hero-title" aria-label="Тайна, завернутая в подарок">
              {heroWords.map((word, index) => (
                <span className="line" key={word} aria-hidden="true">
                  <motion.span
                    initial={{ opacity: 0, y: '105%' }}
                    animate={{ opacity: 1, y: '0%' }}
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
          </div>

          <motion.div
            className="auth-card-wrap"
            ref={cardRef}
            id="auth"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {clerkEnabled ? (
              <AuthCard onAuth={onAuth} invitePending={invitePending} intent={intent} />
            ) : (
              <div className="auth-card auth-card-missing">
                <h2>Вход не настроен</h2>
                <p>Добавьте ключ Clerk в <code>frontend/.env.local</code>:</p>
                <code className="auth-code-line">VITE_CLERK_PUBLISHABLE_KEY=pk_test_…</code>
                <p>и перезапустите фронтенд. Подробности — в README, раздел «Clerk».</p>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <Story onStart={() => focusAuth('signUp')} />

      <section className="preview-section">
        <ContainerScroll
          title={<h2>Вся комната <span className="title-dash">—</span> <span className="serif-accent">на одном экране.</span></h2>}
        >
          <div className="mock-app" aria-hidden="true">
            <div className="mock-nav"><b>Secret Santa</b><i /><span className="mock-avatar" /></div>
            <div className="mock-hero">
              <div>
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
                  <span>{index === 0 ? 'Жеребьевка проведена' : 'Открыта'}</span>
                </div>
              ))}
            </div>
          </div>
        </ContainerScroll>
      </section>

      <Statement text={statement} />

      <section className="bento-section">
        <BlurFade className="section-title centered">
          <div>
            <h2>Всё для идеального <span className="serif-accent">обмена.</span></h2>
          </div>
        </BlurFade>
        <div className="bento">
          <Card className="bento-tile bento-wide bento-wishlist">
            <div className="bento-copy">
              <span className="bento-icon"><Sparkles size={20} /></span>
              <h3>Списки желаний</h3>
              <p>Пожелания и ссылки на подарки. Санта увидит их только после жеребьёвки.</p>
            </div>
            <div className="wish-chips" aria-hidden="true">
              {['Книга', 'Кофе в зёрнах', 'Настольная игра', 'Плед', 'Сертификат'].map((chip, index) => (
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
            <p>Задайте, кто кому не может дарить, — жеребьёвка учтёт.</p>
          </Card>
          <Card className="bento-tile" delay={0.1}>
            <span className="bento-icon"><Mail size={20} /></span>
            <h3>Письма</h3>
            <p>Код подтверждения при входе и письмо после жеребьёвки.</p>
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
            <p>Одна кнопка — и назначения готовы. Без повторов и подсказок.</p>
          </Card>
        </div>
      </section>

      <section className="final-cta dark-section">
        <Snowfall />
        <BlurFade>
          <h2>Подарки начинаются <span className="serif-accent gradient-text">здесь.</span></h2>
        </BlurFade>
        <BlurFade delay={0.1}>
          <p>Создайте комнату за минуту и пригласите всех, кого любите.</p>
        </BlurFade>
        <BlurFade delay={0.2} className="final-cta-actions">
          <Button variant="accent" onClick={() => focusAuth('signUp')}>Создать аккаунт</Button>
          <Button variant="outline" onClick={() => focusAuth('signIn')}>Войти</Button>
        </BlurFade>
        <GiftPile className="cta-pile" count={16} width={18} />
      </section>

      <SiteFooter className="landing-footer" />
    </div>
  );
}

/**
 * "How it works": plays on its own once the section is on screen — three steps,
 * each with a progress bar, while the gift turns and finally opens. No scroll
 * scrubbing. All three texts share one grid cell, so the block never changes height.
 */
function Story({ onStart }: { onStart: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const giftProgress = useRef<number | null>(0);
  const reduced = useReducedMotion();
  const inView = useInView(sectionRef, { amount: 0.45 });
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);

  // Restart from the first step every time the section comes back into view.
  useEffect(() => {
    if (inView) {
      setActive(0);
      setCycle((value) => value + 1);
    }
  }, [inView]);

  // Advance the steps on a timer (not on scroll).
  useEffect(() => {
    if (!inView || reduced || active >= storySteps.length - 1) return;
    const id = window.setTimeout(() => setActive((value) => value + 1), STEP_MS);
    return () => window.clearTimeout(id);
  }, [inView, reduced, active, cycle]);

  // The gift follows the active step with an eased tween: turn → turn more → open.
  useEffect(() => {
    const target = storySteps[active].gift;
    if (reduced) {
      giftProgress.current = target;
      return;
    }
    const controls = animate(giftProgress.current ?? 0, target, {
      duration: 1.4,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (value) => { giftProgress.current = value; }
    });
    return () => controls.stop();
  }, [active, cycle, reduced]);

  return (
    <section className="story dark-section" ref={sectionRef} aria-label="Как это работает">
      <div className="story-inner">
        <div className="story-visual">
          <Gift3D className="story-gift" progressRef={giftProgress} autoRotate={false} interactive={false} />
        </div>
        <div className="story-copy">
          <h2 className="story-heading">Как это работает</h2>
          <div className="story-bars" role="tablist" aria-label="Шаги">
            {storySteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={step.title}
                className={`story-bar ${index < active ? 'is-done' : ''} ${index === active ? 'is-active' : ''}`}
                onClick={() => setActive(index)}
              >
                <span
                  key={`${cycle}-${active}`}
                  style={index === active && !reduced && index < storySteps.length - 1 ? { animationDuration: `${STEP_MS}ms` } : undefined}
                />
              </button>
            ))}
          </div>
          <div className="story-steps">
            {storySteps.map((step, index) => (
              <article key={step.title} className={`story-step ${index === active ? 'is-active' : ''}`} aria-hidden={index !== active}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
          <Button variant="accent" onClick={onStart}>Начать бесплатно</Button>
        </div>
      </div>
    </section>
  );
}

/**
 * The statement turns from light to ink in one quick wave once it is on screen,
 * and back when it leaves — never stuck half-grey in between.
 */
function Statement({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const words = text.split(' ');
  return (
    <section className="statement-section">
      <p ref={ref} className={`statement ${inView ? 'is-revealed' : ''}`} aria-label={text}>
        {words.map((word, index) => (
            <span
              key={index}
              className="statement-word"
              aria-hidden="true"
              style={{ transitionDelay: inView ? `${index * 22}ms` : `${(words.length - index) * 8}ms` }}
            >
              {word}{' '}
            </span>
        ))}
      </p>
    </section>
  );
}
