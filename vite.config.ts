import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { createGoogleBooksFunction } from './server/googleBooksFunction';
import { createMagazordCategoriesFunction } from './server/magazordCategories';
import { createMagazordProductsFunction } from './server/magazordProducts';
import { createSpapiHandler } from './server/spapi/handler';
import { amazonTitleEnvironmentEnabled } from './shared/amazonTitleEnvironment';

export default defineConfig(({ mode }) => {
  const amazon = createSpapiHandler('catalog', { env: { ...loadEnv(mode, process.cwd(), ['AMAZON_SPAPI_', 'SUPABASE_', 'VITE_SUPABASE_']), ...process.env,
    NODE_ENV: mode === 'development' ? 'development' : 'production' } });
  const googleBooks = createGoogleBooksFunction({ env: { ...loadEnv(mode, process.cwd(), 'GOOGLE_BOOKS_'), ...process.env } });
  const categories = createMagazordCategoriesFunction({ env: { ...loadEnv(mode, process.cwd(), ['MAGAZORD_', 'SUPABASE_', 'VITE_SUPABASE_']), ...process.env } });
  const products = createMagazordProductsFunction({ env: { ...loadEnv(mode, process.cwd(), ['MAGAZORD_', 'SUPABASE_', 'VITE_SUPABASE_']), ...process.env } });
  return {
    define: { 'import.meta.env.ISBN_AMAZON_TITLE_PREVIEW': JSON.stringify(process.env.VERCEL_ENV === 'preview' && amazonTitleEnvironmentEnabled(process.env)) },
    plugins: [react(), tailwindcss(), { name: 'google-books-local-api', configureServer(server) {
      server.middlewares.use('/api/amazon/spapi/catalog', async (req, res) => {
        const headers = new Headers();
        for (const key of ['origin', 'sec-fetch-site', 'authorization', 'x-isbn-store-id']) if (typeof req.headers[key] === 'string') headers.set(key, req.headers[key]);
        // Keep the existing HTTPS origin allowlist; never trust forwarded host/protocol headers.
        const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https://' : 'http://';
        const result = await amazon(new Request(protocol + (req.headers.host || 'localhost:3000') + (req.originalUrl || '/api/amazon/spapi/catalog'), { method: req.method, headers }));
        res.statusCode = result.status; result.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await result.text());
      });
      server.middlewares.use('/api/magazord/products', async (req, res) => {
        const headers = new Headers();
        for (const key of ['origin', 'sec-fetch-site', 'authorization', 'x-isbn-store-id']) if (typeof req.headers[key] === 'string') headers.set(key, req.headers[key]);
        const result = await products(new Request('http://' + (req.headers.host || 'localhost:3000') + (req.originalUrl || '/api/magazord/products'), { method: req.method, headers }));
        res.statusCode = result.status; result.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await result.text());
      });
      server.middlewares.use('/api/magazord/categories', async (req, res) => {
        const headers = new Headers();
        for (const key of ['origin', 'sec-fetch-site', 'authorization', 'x-isbn-store-id']) if (typeof req.headers[key] === 'string') headers.set(key, req.headers[key]);
        const result = await categories(new Request('http://' + (req.headers.host || 'localhost:3000') + (req.originalUrl || '/api/magazord/categories'), { method: req.method, headers }));
        res.statusCode = result.status; result.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await result.text());
      });
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
