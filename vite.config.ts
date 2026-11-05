import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { createGoogleBooksFunction } from './server/googleBooksFunction';

export default defineConfig(({ mode }) => {
  const googleBooks = createGoogleBooksFunction({ env: { ...loadEnv(mode, process.cwd(), 'GOOGLE_BOOKS_'), ...process.env } });
  return {
    plugins: [react(), tailwindcss(), { name: 'google-books-local-api', configureServer(server) {
      server.middlewares.use('/api/google-books', async (req, res) => {
        const headers = new Headers();
        for (const key of ['origin', 'sec-fetch-site']) if (typeof req.headers[key] === 'string') headers.set(key, req.headers[key]);
        const result = await googleBooks(new Request('http://' + (req.headers.host || 'localhost:3000') + (req.originalUrl || '/api/google-books'),
          { method: req.method, headers }));
        res.statusCode = result.status; result.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await result.text());
      });
    } }],
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
