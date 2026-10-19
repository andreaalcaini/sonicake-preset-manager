import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Build identifier: the commit SHA in CI (APP_VERSION build arg), otherwise the build time.
// It is compiled into the app and written to dist/version.json: an open page compares the two
// to tell the user that a newer version has been published.
const APP_VERSION = process.env.APP_VERSION || `build-${new Date().toISOString()}`;

/** Emit version.json next to index.html */
const versionFile = () => ({
  name: 'sonicake-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() })
    });
  }
});

export default defineConfig({
  plugins: [
    basicSsl(),
    versionFile()
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  server: {
    host: true, // Exposes server to local network (0.0.0.0)
    port: 5173,
    https: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080', // backend/server.py (npm run dev starts both)
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
