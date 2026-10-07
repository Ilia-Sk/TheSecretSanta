import { Gift, LogOut, Menu, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../api';
import { useCursorScene } from '../hooks/useCursorScene';
import type { AppView } from '../types';
import { Avatar, Button, IconButton } from './ui';
import { AmbientLayer } from './visual';

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
  const shellRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useCursorScene(shellRef);

  useEffect(() => {
    function updateScrolled() {
      setScrolled(window.scrollY > 18);
    }
    updateScrolled();
    window.addEventListener('scroll', updateScrolled, { passive: true });
    return () => window.removeEventListener('scroll', updateScrolled);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="app-shell cinematic-scene" ref={shellRef}>
      <AmbientLayer compact />
      <div className="cursor-light" aria-hidden="true" />
      <header className={scrolled ? 'top-nav scrolled' : 'top-nav'}>
        <button className="brand-btn" type="button" onClick={() => { onDashboard(); closeMenu(); }}>
          <span className="brand-mark"><Gift size={22} /></span>
          <span>
            <strong>The Secret Santa</strong>
            <small>Тайный обмен подарками</small>
          </span>
        </button>

        <nav className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Основная навигация">
          <button className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => { onDashboard(); closeMenu(); }}>
            Комнаты
          </button>
          <button className="nav-item" onClick={() => { onCreate(); closeMenu(); }}>
            Новая комната
          </button>
          <button className={activeView === 'profile' ? 'nav-item active' : 'nav-item'} onClick={() => { onProfile(); closeMenu(); }}>
            Профиль
          </button>
        </nav>

        <div className="nav-actions">
          <Button type="button" variant="primary" className="desktop-create" onClick={onCreate}>
            <Plus size={17} />
            Создать
          </Button>
          <button className="nav-profile" type="button" onClick={onProfile}>
            <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} size="sm" />
            <span>{profile.displayName}</span>
          </button>
          <IconButton label="Выйти" onClick={onLogout}>
            <LogOut size={18} />
          </IconButton>
          <IconButton label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} className="mobile-menu-btn" onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </IconButton>
        </div>
      </header>

      <div className="content-shell">
        <main className="page-frame">{children}</main>
      </div>
    </div>
  );
}
