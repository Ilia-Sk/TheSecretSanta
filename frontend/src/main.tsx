import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { CLERK_PUBLISHABLE_KEY, clerkEnabled } from './auth/clerk';
import { initRenderingHints } from './gl/giftMode';
import './styles.css';

initRenderingHints();

if (!clerkEnabled) {
  console.warn('Clerk: не задан VITE_CLERK_PUBLISHABLE_KEY (frontend/.env.local) — вход недоступен. См. README → Clerk.');
}

const app = (
  <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
    <App />
  </MotionConfig>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {clerkEnabled ? (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
        {app}
      </ClerkProvider>
    ) : app}
  </React.StrictMode>
);
