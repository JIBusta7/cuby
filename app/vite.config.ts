import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 127.0.0.1 y no localhost: Spotify solo acepta direcciones de retorno con la IP.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ['three', '@react-three/fiber'] } },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
