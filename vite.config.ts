import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/uploads': 'http://localhost:8787',
      '/generated': 'http://localhost:8787',
      '/models': 'http://localhost:8787',
      '/hosted': 'http://localhost:8787',
    },
  },
});
