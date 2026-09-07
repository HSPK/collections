import { defineConfig } from 'vite';
import { openAIGatewayPlugin } from './scripts/openai-gateway';
import { independentProjectPages } from './scripts/project-pages';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [openAIGatewayPlugin(), independentProjectPages()],
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
