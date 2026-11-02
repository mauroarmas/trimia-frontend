import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '^/(auth|supervisor|health|knowledge|employees|collections|sales|messaging|improvements|interviews|training|conversations|escalations|clients)': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
