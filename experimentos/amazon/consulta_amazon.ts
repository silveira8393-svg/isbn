// Transporte e validacao compartilhados entre o servidor local e a Vercel Function.
import { request as httpsRequest } from 'node:https';
import { canonicalBookIsbn } from '../../src/utils/bibliographicEvaluation.js';
import { cleanIsbn } from '../../src/utils/isbn.js';
export const MAX_BYTES = 8 * 1024 * 1024;
export class LabError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export function isbn10For(value: string): string {
  const isbn = cleanIsbn(value);
  const canonical = canonicalBookIsbn(isbn);
  if (canonical && isbn.length === 10) return isbn;
  if (!canonical || !canonical.startsWith('978')) throw new LabError(422, 'A consulta HTTP por /dp/ exige ISBN-10 ou ISBN-13 com prefixo 978.');
  const base = canonical.slice(3, 12);
  const digit = (11 - [...base].reduce((sum, d, i) => sum + Number(d) * (10 - i), 0) % 11) % 11;
  return base + (digit === 10 ? 'X' : digit);
}
export interface HtmlResponse { html: string | null; status_http: number | null; mensagem?: string; tamanho_bytes?: number }

/** Um GET com HTTPS nativo: sem proxy, cookies, redirects, retries ou gravação de HTML. */
export function fetchHtml(isbn: string, requestHttps: typeof httpsRequest = httpsRequest): Promise<HtmlResponse> {
  const urlPath = '/dp/' + isbn10For(isbn);
  return new Promise((resolve, reject) => {
    const request = requestHttps({ hostname: 'www.amazon.com.br', path: urlPath, method: 'GET', agent: false,
      headers: { 'User-Agent': 'ProjetoISBN-Laboratorio/1.0 Agent/ProjetoISBN-Laboratorio',
        Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity', Connection: 'close' } }, response => {
      const status = response.statusCode || 0;
      const stop = (mensagem: string) => { resolve({ html: null, status_http: status, mensagem }); response.destroy(); };
      if (status !== 200) return stop('Resposta não 200; interrompido sem redirecionamento ou nova tentativa.');
      if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers['content-type'] || '')) return stop('Resposta sem conteúdo HTML; consulta interrompida.');
      const chunks: Buffer[] = [];
      let length = 0;
      response.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > MAX_BYTES) stop('Resposta acima de 8 MiB; leitura interrompida.');
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        if (/captcha|validatecaptcha|robot check|automated access|acesso automatizado/i.test(html)) return stop('CAPTCHA ou restrição detectada; nenhuma tentativa de contorno.');
        resolve({ html, status_http: status, tamanho_bytes: length });
      });
      response.on('error', () => reject(new LabError(502, 'Falha de transporte ao consultar a Amazon; não houve nova tentativa.')));
    });
    // Prazo total, inclusive resolução DNS e resposta parcial.
    const timeout = setTimeout(() => request.destroy(new Error('timeout')), 25000);
    request.on('close', () => clearTimeout(timeout));
    request.on('error', error => reject(new LabError(502, 'Falha de transporte ao consultar a Amazon; não houve nova tentativa.',
      error.message === 'timeout' ? 'timeout' : 'amazon_transport')));
    request.end();
  });
}

export function validateAmazonQuery(payload: unknown, fallback: 'fixture' | 'http' = 'fixture'): { isbn: string; canonical: string; mode: 'fixture' | 'http' } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(k => !['isbn', 'modo'].includes(k))) throw new LabError(400, 'Informe somente ISBN e modo.');
    const { isbn: raw, modo: mode = fallback } = payload as Record<string, unknown>;
    if (typeof raw !== 'string' || raw.length > 40) throw new LabError(400, 'Informe um único ISBN-10 ou ISBN-13.');
    const isbn = cleanIsbn(raw), canonical = canonicalBookIsbn(isbn);
    if (!canonical) throw new LabError(422, 'ISBN inválido: confira o formato e o dígito verificador.');
    if (mode !== 'fixture' && mode !== 'http') throw new LabError(400, 'Modo de consulta inválido.');
    return { isbn, canonical, mode };
}
