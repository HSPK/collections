import { defineConfig } from 'vite';
import { independentProjectPages } from './scripts/project-pages';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [independentProjectPages()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
