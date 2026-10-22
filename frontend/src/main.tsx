import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { initRenderingHints } from './gl/giftMode';
import './styles.css';

initRenderingHints();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
      <App />
    </MotionConfig>
  </React.StrictMode>
);
