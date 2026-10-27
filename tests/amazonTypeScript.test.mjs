// Nenhum Python, credencial ou rede externa. Transporte Amazon simulado e HTTP somente em loopback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadTypeScript } from '../experimentos/amazon/runtime_typescript.mjs';
const extractor = await loadTypeScript(new URL('../experimentos/amazon/extrator_amazon.ts', import.meta.url));
const { Laboratory, makeServer, isbn10For, fetchHtml, MAX_BYTES } = await loadTypeScript(new URL('../experimentos/amazon/servidor_laboratorio.ts', import.meta.url));
const read = file => readFile(new URL('../experimentos/amazon/' + file, import.meta.url), 'utf8');
const ISBN = '9788535914849';
const base = await read('tests/fixtures/complementares_sinteticos.html');
const parsed = (html = base, isbn = ISBN) => extractor.parseAmazonHtml(html, isbn, 'memoria', 'fixture_sintetica');

test('fixtures bibliográficas sanitizadas mantêm oito campos válidos, datas, pesos e origens', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Extrator puro não pode usar rede'));
  for (const [file, isbn, title, weight, date] of [
    ['amazon_1984_9788535914849.html', ISBN, '1984 - Tradução de Alexandre Hubner e Heloisa Jahn', 605, '2009-07-21'],
    ['amazon_o_alquimista_9788584390670.html', '9788584390670', 'O alquimista', 272, '2017-04-05'],
  ]) {
    const report = parsed(await read('fixtures/' + file), isbn);
    assert.equal(report.correspondencia, 'corresponde');
    assert.equal(report.preenchidos, 9); assert.equal(report.validos_locais, 8);
    assert.equal(report.book_info.title, title); assert.equal(report.book_info.weight, weight);
    assert.equal(report.book_info.publishedDate, date);
    assert.equal(report.campos.sinopse.estado, 'inconsistente');
    assert.equal(report.campos.sinopse.revisao_humana, true);
    assert.equal(report.complementares.dimensoes.estado, 'inconsistente');
    assert.equal(report.book_info.depth, undefined);
    assert.deepEqual(report.imagens.itens, []);
    assert.ok(Object.values(report.campos).every(item => item.origens.length));
  }
});

test('slots DIV homologados de O estrangeiro: capa, miniatura, três adicionais e origens exatas', async () => {
  const report = parsed(await read('tests/fixtures/amazon_estrangeiro_9788501014863_galeria_sanitizada.html'), '9788501014863');
  const result = extractor.toLabResult(report, 'fixture');
  assert.equal(result.imagens.itens.length, 4);
  assert.deepEqual(result.imagens.itens.map(item => item.referencia.split('/').at(-1)),
    ['91Sb5HdDL3L._SL1500_.jpg', '91pv+3HSGRL._SL1500_.jpg', '81YiEHsaX1L._SL1500_.jpg', '31Epa894dmL.jpg']);
  assert.equal(result.book_info.coverUrl, result.imagens.itens[0].referencia);
  assert.match(result.book_info.thumbnailUrl, /61cFRircgZL\._SY445_SX342_ML2_\.jpg$/);
  assert.deepEqual(result.imagens.itens.slice(1).map(item => item.origem), [
    '#imageBlock / data-mb-pv-slot-index=1 (linha 6)', '#imageBlock / data-mb-pv-slot-index=2 (linha 7)', '#imageBlock / data-mb-pv-slot-index=3 (linha 8)']);
  assert.deepEqual(result.book_info.additionalImages, result.imagens.itens.slice(1).map(item => item.referencia));
});

test('galeria de scripts deduplica resoluções e rejeita vídeo, ícones, outra edição e recomendações', async () => {
  const report = parsed(await read('tests/fixtures/galeria_script_sintetica.html'), '8501014869');
  assert.equal(report.imagens.itens.length, 3);
  assert.match(report.imagens.itens[0].referencia, /ISBNFixtureCapa\.jpg$/);
  assert.match(report.imagens.itens[2].referencia, /ISBNFixtureLombada\.jpg$/);
  assert.doesNotMatch(JSON.stringify(report.imagens), /OutraEdicao|OutroLivro|Video|Icon|Pixel|Spin/);
  assert.ok(report.imagens.itens.every(item => item.origem.includes('script / galeria inicial')));
});

test('normalização, sinopse explícita, unidades e conflitos impedem projeção dos candidatos inválidos', () => {
  const result = parsed();
  assert.equal(result.validos_locais, 9);
  assert.equal(result.book_info.language, 'Português'); assert.equal(result.book_info.format, 'CC - Capa Convencional');
  assert.deepEqual([result.book_info.width, result.book_info.height, result.book_info.depth], [14, 21, 2.5]);
  const conflict = parsed(base.replace('</table>', '<tr><th>Largura</th><td>15 cm</td></tr><tr><th>Ano</th><td>2010</td></tr></table>'));
  assert.equal(conflict.book_info.width, undefined); assert.equal(conflict.book_info.publishedDate, undefined);
  assert.equal(conflict.complementares.largura.estado, 'inconsistente');
  assert.equal(parsed(base, '9788584390670').book_info.isbn13, undefined);
  for (const raw of ['14 x 21 x 2,5 cm', '14 x 21 x 2,5', '14 x 21 x 2,5 cm (C x L x A)'])
    assert.equal(parsed(base.replace('140 x 210 x 25 mm (L x A x P)', raw)).book_info.depth, undefined);
});

test('API sanitiza evidências e não executa scripts, mas preserva referências públicas de imagem', () => {
  const result = extractor.toLabResult(parsed(base.replace('Editora Sintética', 'cookie=SECRET session-id=OTHER')), 'fixture');
  assert.doesNotMatch(JSON.stringify(result), /SECRET|OTHER|<html/);
  assert.equal(result.book_info.coverUrl, 'https://isbn-fixtures.invalid/capa-autoral.svg');
  assert.equal(result.campos.editora.estado, 'inconsistente');
  assert.equal(result.imagens.download_realizado, false);
  assert.equal(parsed('<script>globalThis.__executado=true</script>').preenchidos, 0);
  assert.equal(globalThis.__executado, undefined);
});

test('laboratório lê três fixtures e ISBN-10 sem Python nem HTTP externo', async () => {
  const lab = new Laboratory({ readHtml: file => readFile(file, 'utf8'), fetchHtml: () => assert.fail('Sem HTTP em fixture') });
  for (const isbn of ['8535914846', '9788584390670', '9788501014863']) {
    const result = await lab.search({ isbn, modo: 'fixture' });
    assert.equal(result.status, 'concluida'); assert.equal(result.status_http, null);
    assert.equal(result.correspondencia, 'corresponde');
  }
  for (const [payload, status] of [[null, 400], [{ isbn: ISBN, url: 'https://example.invalid' }, 400], [{ isbn: '9788535914840' }, 422],
    [{ isbn: ISBN, modo: 'invalid' }, 400], [{ isbn: '9780804429573' }, 404]]) await assert.rejects(lab.search(payload), error => error.status === status);
});

test('uma busca por vez, sem fila; falhas liberam a próxima tentativa', async () => {
  let finish;
  const lab = new Laboratory({ readHtml: async () => base, fetchHtml: () => new Promise(resolve => { finish = resolve; }) });
  const first = lab.search({ isbn: ISBN, modo: 'http' });
  await assert.rejects(lab.search({ isbn: ISBN }), error => error.status === 409);
  finish({ html: null, status_http: 403, mensagem: 'Interrompido' });
  assert.equal((await first).status, 'interrompida');
  assert.equal((await lab.search({ isbn: ISBN })).status, 'concluida');
  const failing = new Laboratory({ readHtml: async () => { throw new Error('Falha local'); }, fetchHtml: async () => ({ html: base, status_http: 200 }) });
  await assert.rejects(failing.search({ isbn: ISBN }));
  assert.equal((await failing.search({ isbn: ISBN, modo: 'http' })).status, 'concluida');
});

test('transporte fixo preserva GET único, ISBN-10, bloqueios, limites e nenhuma nova tentativa', async () => {
  assert.equal(isbn10For(ISBN), '8535914846'); assert.equal(isbn10For('0-8044-2957-x'), '080442957X');
  assert.throws(() => isbn10For('9791090636071'), error => error.status === 422);
  for (const [status, mime, body, message] of [[200, 'text/html', '<html>produto</html>', null], [302, 'text/html', '', /não 200/],
    [403, 'text/html', '', /não 200/], [200, 'application/json', '{}', /sem conteúdo HTML/],
    [200, 'text/html', 'robot check captcha', /CAPTCHA/], [200, 'text/html', 'x'.repeat(MAX_BYTES + 1), /8 MiB/]]) {
    let calls = 0;
    const result = await fetchHtml(ISBN, (options, callback) => {
      calls++;
      assert.equal(options.hostname, 'www.amazon.com.br'); assert.equal(options.path, '/dp/8535914846');
      assert.equal(options.method, 'GET'); assert.equal(options.headers.Cookie, undefined);
      const request = new EventEmitter();
      request.end = () => setImmediate(() => {
        const response = Readable.from([Buffer.from(body)]);
        Object.assign(response, { statusCode: status, headers: { 'content-type': mime } });
        response.once('close', () => request.emit('close'));
        callback(response);
      });
      request.destroy = error => { request.emit('error', error); request.emit('close'); };
      return request;
    });
    assert.equal(calls, 1);
    assert.equal(result.status_http, status);
    if (message) { assert.equal(result.html, null); assert.match(result.mensagem, message); }
    else assert.equal(result.html, body);
  }
  await assert.rejects(fetchHtml(ISBN, () => {
    const request = new EventEmitter();
    request.end = () => setImmediate(() => { request.emit('error', new Error('Falha simulada')); request.emit('close'); });
    return request;
  }), error => error.status === 502);
});

test('servidor local valida Host, Origin, cabeçalho, JSON e tamanho; contrato real sem Python', async t => {
  const server = makeServer(0);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); server.closeAllConnections(); });
  const address = `http://127.0.0.1:${server.address().port}/__amazon_lab/`;
  const headers = { 'X-ISBN-Lab': 'local-development', Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' };
  const request = (route, init = {}) => fetch(address + route, { redirect: 'error', signal: AbortSignal.timeout(5000), ...init });
  assert.equal((await request('health')).status, 403);
  const spoofedHostStatus = await new Promise((resolve, reject) => {
    const call = httpRequest(address + 'health', { headers: { ...headers, Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode); });
    call.on('error', reject); call.end();
  });
  assert.equal(spoofedHostStatus, 403);
  assert.equal((await request('health', { headers: { ...headers, Origin: 'https://evil.invalid' } })).status, 403);
  const health = await request('health', { headers });
  assert.equal(health.status, 200); assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await health.json()).fixtures.length, 3);
  for (const [body, custom, status] of [['{bad', {}, 400], ['x'.repeat(1025), {}, 413], ['{}', { 'Content-Type': 'text/plain' }, 415],
    [JSON.stringify({ isbn: ISBN }), { Origin: '' }, 403], [JSON.stringify({ isbn: 'invalid' }), {}, 422]])
    assert.equal((await request('search', { method: 'POST', headers: { ...headers, ...custom }, body })).status, status);
  const response = await request('search', { method: 'POST', headers, body: JSON.stringify({ isbn: '9788501014863', modo: 'fixture' }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'concluida'); assert.equal(result.imagens.itens.length, 4);
  assert.equal(result.book_info.additionalImages.length, 3);
});
