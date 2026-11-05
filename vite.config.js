import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const address = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL
    ?? process.env.VITE_API_BASE ?? env.VITE_API_BASE;
  const sameOrigin = (process.env.VITE_SAME_ORIGIN ?? env.VITE_SAME_ORIGIN) === 'true';
  if (mode === 'production' && !sameOrigin) {
    if (!address) throw new Error('Definí VITE_API_BASE_URL con la URL HTTPS del backend, o VITE_SAME_ORIGIN=true si el panel y la API comparten servidor.');
    if (new URL(address).protocol !== 'https:') throw new Error('VITE_API_BASE_URL debe usar HTTPS en producción.');
  }
  if (sameOrigin && address) throw new Error('Con VITE_SAME_ORIGIN=true, dejá VITE_API_BASE_URL y VITE_API_BASE vacíos.');
  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: true,
      proxy: {
        '^/(auth|supervisor|health|knowledge|employees|collections|sales|messaging|improvements|interviews|training|conversations|escalations|clients)': {
          target: process.env.VITE_DEV_PROXY_TARGET ?? env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
