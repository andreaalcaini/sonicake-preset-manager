import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

const fromRoot = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    basicSsl()
  ],
  server: {
    host: true, // Exposes server to local network (0.0.0.0)
    port: 5173,
    // Server data volume and Python compiler are not part of the frontend
    // (absolute paths: a '**/data/**' glob would also hide src/data from hot reload)
    watch: { ignored: [`${fromRoot('./data')}/**`, `${fromRoot('./server')}/**`] },
    https: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    // The pedal data tables (command library ~735 KB) change rarely: a chunk of their own keeps
    // them cached in browsers and the PWA when only the code changes
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/data/')) return 'pedal-data';
        }
      }
    }
  }
});
