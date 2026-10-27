import { randomUUID } from 'node:crypto';
import { fetchHtml, LabError, validateAmazonQuery } from '../experimentos/amazon/consulta_amazon.js';
import { parseAmazonHtml, toLabResult } from '../experimentos/amazon/extrator_amazon.js';
import { AmazonAccessError, authorizeAmazonDeveloper, readLimitedJson } from './amazonAuthorization.js';

export function createAmazonFunction(options: {
  authorize?: typeof authorizeAmazonDeveloper; fetchHtml?: typeof fetchHtml;
  env?: NodeJS.ProcessEnv; log?: (value: string) => void;
} = {}) {
  const authorize = options.authorize || authorizeAmazonDeveloper;
  const readHtml = options.fetchHtml || fetchHtml;
  const env = options.env || process.env;
  const log = options.log || ((value: string) => console.info(value));
  let busy = false; // Exclusão apenas nesta instância; não é uma fila/limite global.
  return async (request: Request): Promise<Response> => {
    const started = performance.now(), id = randomUUID();
    let statusHttp: number | null = null;
    function reply(status: number, payload: object, code: string) {
      // A Vercel limita a resposta da Function; nunca devolver HTML/extração gigante.
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 4 * 1024 * 1024) {
        status = 502; code = 'response_limit'; payload = { mensagem: 'Resultado acima do limite de resposta do laboratório.' };
      }
      const diagnostico = { id, duracao_ms: Math.round((performance.now() - started) * 100) / 100,
        status_function: status, status_http: statusHttp, codigo: code };
      // Somente métricas e códigos controlados: sem ISBN, usuário, token, URL ou HTML.
      log(JSON.stringify({ evento: 'amazon_lab', ...diagnostico }));
      return Response.json({ ...payload, diagnostico }, { status, headers: {
        'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
        Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff', 'X-ISBN-Request-Id': id,
        ...(status === 405 ? { Allow: 'GET, POST' } : {}),
      } });
    }
    try {
      const url = new URL(request.url);
      if (url.pathname !== '/api/amazon' || [...url.searchParams.keys()].some(key => key !== 'acao')
        || url.searchParams.getAll('acao').length > 1) return reply(404, { mensagem: 'Rota não encontrada.' }, 'not_found');
      const action = url.searchParams.get('acao') || (request.method === 'GET' ? 'health' : 'search');
      if (!['GET', 'POST'].includes(request.method)) return reply(405, { mensagem: 'Método não permitido.' }, 'method_not_allowed');
      if ((request.method === 'GET' && action !== 'health') || (request.method === 'POST' && action !== 'search')) {
        return reply(404, { mensagem: 'Rota não encontrada.' }, 'not_found');
      }
      const origin = request.headers.get('origin');
      if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
        return reply(403, { mensagem: 'Origem não permitida.' }, 'origin_denied');
      }
      await authorize(request, env);
      if (request.method === 'GET') return reply(200, { http_habilitado: true, fixtures: [], persistencia: false }, 'ready');
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
        return reply(415, { mensagem: 'Utilize application/json.' }, 'content_type');
      }
      const declared = request.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 1024)) {
        return reply(413, { mensagem: 'Solicitação inválida ou acima de 1 KiB.' }, 'body_limit');
      }
      let payload: unknown;
      try { payload = await readLimitedJson(request.body, 1024, AbortSignal.timeout(5000)); }
      catch (error) {
        const limit = error instanceof Error && error.message === 'body_limit';
        return reply(limit ? 413 : 400, { mensagem: limit ? 'Solicitação acima de 1 KiB.' : 'Solicitação JSON inválida ou incompleta.' }, limit ? 'body_limit' : 'invalid_json');
      }
      const { isbn, mode } = validateAmazonQuery(payload, 'http');
      if (mode !== 'http') return reply(400, { mensagem: 'HTML sanitizado local está disponível somente no desenvolvimento local.' }, 'local_fixture_only');
      if (busy) return reply(409, { mensagem: 'Há uma pesquisa em andamento nesta instância. Aguarde sua conclusão; não há fila.' }, 'busy');
      busy = true;
      try {
        const metadata = await readHtml(isbn);
        statusHttp = metadata.status_http;
        const duration = Math.round((performance.now() - started) * 100) / 100;
        if (metadata.html === null) {
          const code = /CAPTCHA/.test(metadata.mensagem || '') ? 'amazon_captcha' : statusHttp !== 200 ? 'amazon_http' : 'amazon_unexpected';
          return reply(200, { modo: 'http', isbn_pesquisado: isbn, total_campos: 9, status_http: statusHttp,
            status: 'interrompida', duracao_ms: duration, mensagem: metadata.mensagem }, code);
        }
        const result = toLabResult(parseAmazonHtml(metadata.html, isbn, 'memoria', 'http_local_experimental'), 'http', duration, statusHttp);
        return reply(200, result, 'completed');
      } finally { busy = false; }
    } catch (error) {
      if (error instanceof AmazonAccessError) return reply(error.status, { mensagem: error.message }, error.code);
      if (error instanceof LabError) return reply(error.code === 'timeout' ? 504 : error.status,
        { mensagem: error.message }, error.code || (error.status < 500 ? 'invalid_query' : 'amazon_transport'));
      return reply(500, { mensagem: 'Falha na Function Amazon; nenhum dado foi persistido.' }, 'internal_error');
    }
  };
}
