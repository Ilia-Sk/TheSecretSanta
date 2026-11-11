import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = {
  '/api': 'http://localhost:8080',
  '/uploads': 'http://localhost:8080'
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: backend
  },
  // The default preview port 4173 is often reserved by Windows (Hyper-V/WSL),
  // so the built site opens on the same 5173 as the dev server. If 5173 is busy
  // (dev server running), Vite takes the next free port and prints it.
  preview: {
    host: '127.0.0.1',
    port: 5173,
    proxy: backend
  }
});
