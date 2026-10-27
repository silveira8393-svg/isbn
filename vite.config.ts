import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // Apenas o servidor de desenvolvimento; nenhuma rota de coleta é publicada no build.
      proxy: {
        '/__amazon_lab/': {
          target: 'http://127.0.0.1:8765', changeOrigin: true,
          bypass(request) {
            const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');
            if (!local || !/^(127\.0\.0\.1|localhost):3000$/.test(request.headers.host || '')) return false;
          },
        },
      },
    },
  };
});
