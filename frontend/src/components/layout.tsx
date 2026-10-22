import { Gift, LogOut, Menu, Plus, X } from 'lucide-react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Profile } from '../api';
import type { AppView } from '../types';
import { ScrollProgress } from './magicui';
import { Avatar } from './ui';

export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Gift size={size} strokeWidth={2.2} />
    </span>
  );
}

// Room creation lives in the single «Создать» button (and the mobile menu).
const navItems: Array<{ id: 'dashboard' | 'profile'; label: string }> = [
  { id: 'dashboard', label: 'Комнаты' },
  { id: 'profile', label: 'Профиль' }
];

export function AppLayout({
  profile,
  activeView,
  children,
  onDashboard,
  onCreate,
  onProfile,
  onLogout
}: {
  profile: Profile;
  activeView: AppView;
  children: React.ReactNode;
  onDashboard: () => void;
  onCreate: () => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (value) => setCompact(value > 24));

  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen);
    return () => document.body.classList.remove('menu-open');
  }, [menuOpen]);

  function go(action: () => void) {
    action();
    setMenuOpen(false);
  }

  const handlers = { dashboard: onDashboard, profile: onProfile };
  const current = activeView === 'profile' ? 'profile' : 'dashboard';

  return (
    <div className="app-shell">
      <ScrollProgress />
      <motion.header
        className={`global-nav ${compact ? 'is-compact' : ''} ${menuOpen ? 'is-open' : ''}`}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      >
        <div className="global-nav-inner glass">
          <button className="brand-btn" type="button" onClick={() => go(onDashboard)} aria-label="The Secret Santa — на главную">
            <BrandMark />
            <span>Secret Santa</span>
          </button>

          <nav className="global-links" aria-label="Основная навигация">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={current === item.id ? 'active' : ''}
                aria-current={current === item.id ? 'page' : undefined}
                onClick={() => go(handlers[item.id])}
              >
                {current === item.id && (
                  <motion.span layoutId="global-nav-pill" className="nav-pill-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                )}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="global-actions">
            <motion.button type="button" className="nav-cta" onClick={onCreate} whileTap={{ scale: 0.94 }}>
              <Plus size={14} strokeWidth={2.6} />
              Создать
            </motion.button>
            <button className="nav-avatar" type="button" onClick={() => go(onProfile)} aria-label={`Профиль: ${profile.displayName}`}>
              <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} size="sm" />
            </button>
            <button type="button" className="nav-icon nav-logout" onClick={onLogout} aria-label="Выйти" title="Выйти">
              <LogOut size={16} />
            </button>
            <button
              type="button"
              className="nav-icon nav-burger"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="mobile-menu glass-sheet"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } }}
          >
            {[...navItems.map((item) => ({ label: item.label, action: handlers[item.id] })), { label: 'Создать комнату', action: onCreate }, { label: 'Выйти', action: onLogout }].map((item, index) => (
              <motion.button
                key={item.label}
                type="button"
                onClick={() => go(item.action)}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * index }}
              >
                {item.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* One page at a time: the old page fades out quickly, then the new one rises in.
          Rendering both at once (popLayout) doubled the compositing work. */}
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

      <footer className="site-footer">
        <div>
          <span>The Secret Santa</span>
          <span>Тайный обмен подарками для друзей, семьи и команды.</span>
        </div>
        <span>Сделано с теплом · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
