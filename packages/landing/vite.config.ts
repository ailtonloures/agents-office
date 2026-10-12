import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { seoPlugin } from './build/seoPlugin';

export default defineConfig({
  plugins: [react(), seoPlugin()],
  build: { outDir: 'dist' },
});
