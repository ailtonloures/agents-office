import { defineConfig } from 'vite';

const daemonPort = process.env.AGENTS_OFFICE_PORT ?? '4777';
const daemon = `127.0.0.1:${daemonPort}`;

export default defineConfig({
  build: {
    outDir: 'dist',
    // Phaser alone is ~1 MB minified; it gets its own chunk.
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  server: {
    proxy: {
      '/stream': { target: `ws://${daemon}`, ws: true },
      '/health': `http://${daemon}`,
      '^/skin/': `http://${daemon}`,
    },
  },
});
