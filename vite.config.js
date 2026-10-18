import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl()
  ],
  server: {
    host: true, // Exposes server to local network (0.0.0.0)
    port: 5173,
    // Server data volume and Python compiler are not part of the frontend
    watch: { ignored: ['**/data/**', '**/server/**'] },
    https: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
