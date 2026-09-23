import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.API_ORIGIN ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
