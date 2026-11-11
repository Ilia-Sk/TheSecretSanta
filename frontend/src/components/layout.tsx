import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../api';
import type { AppView } from '../types';
import { Logo } from './Logo';
import { Avatar } from './ui';

export function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <span>Сделано с теплом</span>
    </footer>
  );
}

/**
 * App shell: the logo (back to the rooms) and the avatar (account). Room creation
 * lives on the rooms page, signing out — in the account.
 */
export function AppLayout({
  profile,
  activeView,
  children,
  onDashboard,
  onProfile
}: {
  profile: Profile;
  activeView: AppView;
  children: React.ReactNode;
  onDashboard: () => void;
  onProfile: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (value) => setScrolled(value > 8));
  // Sticky bars below the header (room bar) stick exactly under it.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => document.documentElement.style.setProperty('--app-header-h', `${header.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <header ref={headerRef} className={`app-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="app-header-inner">
          <button className="logo-btn" type="button" onClick={onDashboard} aria-label="Secret Santa — мои комнаты">
            <Logo />
          </button>
          <button
            className={`avatar-btn ${activeView === 'profile' ? 'is-active' : ''}`}
            type="button"
            onClick={onProfile}
            aria-label={`Аккаунт: ${profile.displayName}`}
            aria-current={activeView === 'profile' ? 'page' : undefined}
          >
            <span className="avatar-btn-name">{profile.displayName}</span>
            <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} size="sm" />
          </button>
        </div>
      </header>

      {/* One page at a time: the old page fades out quickly, then the new one rises in. */}
      <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo({ top: 0, behavior: 'auto' })}>
        <motion.main
          key={activeView}
          className="page-frame"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.14, ease: 'easeIn' } }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.main>
      </AnimatePresence>

      <SiteFooter />
    </div>
  );
}
