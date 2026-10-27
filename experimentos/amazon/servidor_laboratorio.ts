// Serviço exclusivamente local e sem persistência. Nenhuma consulta ocorre na inicialização.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHtml, LabError, validateAmazonQuery, type HtmlResponse } from './consulta_amazon';
export { fetchHtml, LabError, isbn10For, MAX_BYTES } from './consulta_amazon';
import { parseAmazonHtml, toLabResult } from './extrator_amazon';

const root = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES: Record<string, string> = {
  '9788535914849': path.join(root, 'fixtures/amazon_1984_9788535914849.html'),
  '9788584390670': path.join(root, 'fixtures/amazon_o_alquimista_9788584390670.html'),
  '9788501014863': path.join(root, 'tests/fixtures/amazon_estrangeiro_9788501014863_galeria_sanitizada.html'),
};
const PREFIX = '/__amazon_lab/';
export class Laboratory {
  private busy = false;
  constructor(private dependencies = { readHtml: (file: string) => readFile(file, 'utf8'), fetchHtml }) {}
  async search(payload: unknown) {
    const { isbn, canonical, mode } = validateAmazonQuery(payload);
    if (this.busy) throw new LabError(409, 'Há uma pesquisa em andamento. Aguarde sua conclusão; não há fila.');
    this.busy = true;
    const started = performance.now();
    try {
      let html: string | null, metadata: Omit<HtmlResponse, 'html'> = { status_http: null };
      if (mode === 'fixture') {
        const file = FIXTURES[canonical];
        if (!file) throw new LabError(404, 'Fixture não disponível. Use 9788535914849, 9788584390670 ou 9788501014863.');
        html = await this.dependencies.readHtml(file);
      } else ({ html, ...metadata } = await this.dependencies.fetchHtml(isbn));
      const duration = () => Math.round((performance.now() - started) * 100) / 100;
      if (html === null) return { modo: mode, isbn_pesquisado: isbn, total_campos: 9, ...metadata, status: 'interrompida', duracao_ms: duration() };
      const parsed = parseAmazonHtml(html, isbn, 'memoria', mode === 'fixture' ? 'real_html_sanitizado' : 'http_local_experimental');
      return { ...toLabResult(parsed, mode, duration(), metadata.status_http), ...metadata };
    } finally { this.busy = false; }
  }
}

export function makeServer(port = 8765, origin = 'http://127.0.0.1:3000', lab = new Laboratory()) {
  if (!['http://127.0.0.1:3000', 'http://localhost:3000'].includes(origin)) throw new Error('Origem local inválida.');
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    function reply(status: number, payload: object) {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(payload));
    }
    try {
      const address = server.address(), actualPort = typeof address === 'object' && address ? address.port : port;
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '')
        || ![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(request.headers.host || '')
        || !(request.headers.origin === origin || (request.method === 'GET' && request.headers.origin === undefined))
        || request.headers['x-isbn-lab'] !== 'local-development') return reply(403, { mensagem: 'Acesso restrito à interface local de desenvolvimento.' });
      if (request.method === 'GET' && request.url === PREFIX + 'health') return reply(200, { http_habilitado: true, fixtures: Object.keys(FIXTURES), persistencia: false });
      if (request.method !== 'POST' || request.url !== PREFIX + 'search') return reply(404, { mensagem: 'Rota não encontrada.' });
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) return reply(415, { mensagem: 'Utilize application/json.' });
      const length = Number(request.headers['content-length']);
      if (!Number.isInteger(length) || length < 1 || length > 1024) return reply(413, { mensagem: 'Solicitação inválida ou acima de 1 KiB.' });
      request.setTimeout(5000, () => request.destroy());
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024) throw new LabError(413, 'Solicitação inválida ou acima de 1 KiB.');
        chunks.push(chunk);
      }
      request.setTimeout(0);
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { throw new LabError(400, 'Solicitação JSON inválida.'); }
      reply(200, await lab.search(payload));
    } catch (error) {
      reply(error instanceof LabError ? error.status : 500, { mensagem: error instanceof LabError ? error.message : 'Falha local no laboratório; nenhum dado foi persistido.' });
    }
  });
  server.requestTimeout = 5000;
  return server;
}

export function startServer(args = process.argv.slice(2)) {
  let port = 8765, origin = 'http://127.0.0.1:3000';
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--porta') port = Number(args[i + 1]);
    else if (args[i] === '--origem') origin = args[i + 1];
    else throw new Error('Argumento desconhecido: ' + args[i]);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Porta inválida.');
  const server = makeServer(port, origin);
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('message', message => { if (message === 'shutdown') { stop(); process.disconnect?.(); } });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
  server.on('error', () => { console.error('Não foi possível iniciar o laboratório TypeScript; verifique a porta.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Laboratorio TypeScript em 127.0.0.1:${(server.address() as { port: number }).port}; HTTP real disponivel.`));
  return server;
}
