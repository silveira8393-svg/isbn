import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './src/utils/bibliographicEvaluation';
  export * from './experimentos/amazon/contrato_provedores';
  export { evaluateAmazonLab } from './src/services/amazonLabClient';
  export { searchBookByIsbnBrasilApi } from './src/services/brasilApi';
  export { searchBookByIsbnDistribuidoraCuritiba, mergeBookWithDistribuidora } from './src/services/distribuidoraCuritiba';
` }, bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env.DEV': 'true' } });
const module = { exports: {} };
new Function('module', 'exports', built.outputFiles[0].text)(module, module.exports);
const { evaluateBook, evaluateBrasilApi, evaluateCuritiba, evaluateAmazonLab, consolidateBooks, canonicalBookIsbn,
  BIBLIOGRAPHIC_FIELDS, synopsisReasons, searchBookByIsbnBrasilApi, searchBookByIsbnDistribuidoraCuritiba, mergeBookWithDistribuidora } = module.exports;

const ISBN = '9788535914849';
const synopsis = 'Uma jovem explora a história de sua família em uma cidade distante. A narrativa apresenta suas descobertas e discute as escolhas que transformam seus caminhos e os de seus amigos.';
const fixture = { id: 'fixture', title: 'Livro sintético', authors: ['Autora Sintética'], publisher: 'Editora Sintética',
  year: 2009, edition: '1ª', language: 'pt-BR', format: 'Capa comum', pageCount: 416, synopsis, isbn10: '8535914846', isbn13: ISBN };
const api = { isbn: ISBN, title: fixture.title, subtitle: null, authors: fixture.authors, publisher: fixture.publisher,
  year: 2009, pages: 416, attributes: null, location: null, dimensions: null, weight: null,
  format: 'Brochura', subject: null, cover_url: null, provider: 'fixture', synopsis };
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const bundledPython = path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = [process.env.ISBN_TEST_PYTHON, existsSync(bundledPython) ? bundledPython : null, 'python', 'python3'].filter(Boolean)
  .find(command => spawnSync(command, ['-c', 'import sys; raise SystemExit(sys.version_info < (3, 10))'], { windowsHide: true, timeout: 5000 }).status === 0);
assert.ok(python, 'Python 3.10+ necessário para testar o contrato real Python → TypeScript');
const parsed = spawnSync(python, ['-B', '-c', `
import json, socket, sys
from unittest.mock import patch
sys.path.insert(0, 'experimentos/amazon')
import prototipo_isbn_amazon_local as e
with patch.object(socket.socket, 'connect', side_effect=AssertionError('Sem rede')):
    result = e.parse('experimentos/amazon/tests/fixtures/complementares_sinteticos.html', '${ISBN}', 'fixture_sintetica')
    print(json.dumps(result, ensure_ascii=False))
`], { windowsHide: true, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
assert.equal(parsed.status, 0, parsed.stderr);
const amazon = JSON.parse(parsed.stdout);

test('três provedores respeitam BookInfo e o mesmo indicador de nove campos, sem consultas', () => {
  const evaluations = [evaluateBrasilApi(api, ISBN), evaluateCuritiba({ ...fixture, weight: .502, weightUnit: 'kg' }, ISBN), evaluateAmazonLab(amazon)];
  for (const result of evaluations) {
    assert.equal(result.match, 'matches');
    assert.equal(BIBLIOGRAPHIC_FIELDS.length, 9);
    assert.equal(result.book.format, 'CC - Capa Convencional');
    assert.equal(result.book.title, fixture.title);
    assert.deepEqual(result.book.authors, fixture.authors);
    assert.equal(result.book.isbn13, ISBN);
    assert.ok(Object.keys(result.book.provenance).length);
  }
  assert.equal(evaluations[0].filled, 7, 'BrasilAPI não inventa idioma nem edição ausentes');
  assert.equal(evaluations[0].book.language, undefined);
  assert.equal(evaluations[1].book.weight, 502);
  assert.equal(evaluations[2].book.weight, 502);
  assert.equal(evaluations[2].valid, 9);
  assert.equal(evaluations[2].book.publishedDate, '2009-07-21');
  assert.deepEqual([evaluations[2].book.width, evaluations[2].book.height, evaluations[2].book.depth], [14, 21, 2.5]);
  assert.equal(evaluations[2].book.coverUrl, amazon.book_info.coverUrl);
  assert.deepEqual(evaluations[2].book.additionalImages, amazon.book_info.additionalImages);
});

test('serviços atuais são observados com fetch simulado; prioridade operacional permanece documentada', async t => {
  t.mock.method(globalThis, 'fetch', async () => json(api));
  const brasil = await searchBookByIsbnBrasilApi(ISBN);
  assert.equal(brasil.book.language, 'pt', 'Comportamento atual: idioma presumido, ainda não corrigido no operacional');
  const fields = { AD_CDISBN: '8535914846', AD_DSAUTOR: 'Autora Sintética', AD_DSEDITORA: 'Editora Sintética',
    AD_DSFORMATO: 'Capa comum', AD_NUEDICAO: '1', AD_ANOEDICAO: '2009', AD_DESCRICAOIDIOMA: 'Português',
    AD_NRPAGINA: 416, AD_QTPESOLIQUIDO: '0,502', AD_QTLARGURA: 14, AD_QTALTURA: 21, AD_QTCOMPRIMENTO: 2.5, AD_DSSINOPSE: synopsis };
  const product = { cdProduto: 1, dsProduto: fixture.title, nuCdBarras: ISBN };
  const responses = [{ usuario: {} }, product, { ...product, ...fields }];
  let count = 0;
  globalThis.fetch = async () => json(responses[count++]);
  const curitiba = await searchBookByIsbnDistribuidoraCuritiba(ISBN);
  assert.equal(count, 3);
  const evaluation = evaluateCuritiba(curitiba.book, ISBN);
  assert.equal(evaluation.valid, 9);
  assert.equal(evaluation.book.weight, 502);
  assert.equal(evaluation.book.depth, undefined, 'Comprimento do serviço não comprova espessura');
  assert.equal(evaluation.fields.depth.state, 'inconsistent');
  const merged = mergeBookWithDistribuidora({ ...fixture, format: 'CD', edition: '2ª', weight: 800, weightUnit: 'g', provenance: { title: 'base' } }, curitiba.book);
  assert.equal(merged.title, fixture.title);
  assert.equal(merged.edition, '1');
  assert.equal(merged.format, 'Capa comum');
  assert.equal(merged.weight, .502);
  assert.equal(merged.provenance.title, undefined, 'Merge atual substitui objeto de proveniência');
});

test('normalização não altera fonte e preserva ausências, formatos e idiomas ambíguos', () => {
  const input = { ...fixture, authors: [' ', 'Autora Sintética', 'Autora Sintética'], format: 'Brochura ou capa dura', language: 'pt e en', edition: '2ª reimpressão' };
  const before = structuredClone(input), result = evaluateBook(input, 'fixture', ISBN);
  assert.deepEqual(input, before);
  for (const field of ['format', 'language', 'edition']) assert.equal(result.fields[field].state, 'inconsistent');
  assert.deepEqual(result.book.authors, ['Autora Sintética']);
  const empty = evaluateBook({ title: 'Título não cadastrado', publisher: 'Não informado', authors: ['N/A'], pageCount: 0 }, 'fixture');
  assert.equal(empty.filled, 1, 'Páginas zero são presentes, mas inconsistentes');
  assert.equal(empty.valid, 0);
  assert.equal(empty.fields.publisher.state, 'missing');
});

test('ISBNs usam dígito verificador, equivalência 10/13 e identidade da edição', () => {
  assert.equal(canonicalBookIsbn('8535914846'), ISBN);
  assert.equal(canonicalBookIsbn('978-8535914849'), ISBN);
  for (const id of ['9788535914840', 'ISBN 9788535914849', '0000000000', '4006381333931']) assert.equal(canonicalBookIsbn(id), undefined);
  assert.equal(evaluateBook({ ...fixture, isbn10: '8584390677' }, 'fixture', ISBN).match, 'inconsistent');
  assert.equal(evaluateBook(fixture, 'fixture', '9788584390670').match, 'divergent');
  assert.equal(evaluateBook({ ...fixture, isbn10: ISBN }, 'fixture', ISBN).match, 'inconsistent');
  assert.equal(evaluateBook({ ...fixture, isbn10: '8535914840' }, 'fixture', ISBN).book.isbn10, undefined);
  assert.equal(evaluateBook({ title: 'Livro' }, 'fixture', ISBN).match, 'unverifiable');
});

test('unidades explícitas, datas reais e imagens ausentes não recebem suposições', () => {
  const input = { ...fixture, weight: .502, weightUnit: 'kg', width: 14, publishedDate: '2009-02-30', additionalImages: ['javascript:bad', 'https://example.invalid/adicional.svg', 'https://example.invalid/adicional.svg'] };
  const result = evaluateBook(input, 'fixture', ISBN);
  assert.equal(result.book.weight, 502);
  assert.equal(result.book.weightUnit, 'g');
  assert.equal(result.fields.width.state, 'inconsistent');
  assert.equal(result.fields.publishedDate.state, 'inconsistent');
  assert.equal(result.book.coverUrl, undefined, 'Imagem adicional não inventa identificação de capa');
  assert.equal(result.book.additionalImages.length, 1);
  assert.equal(evaluateBook(fixture, 'fixture').book.additionalImages, undefined);
  assert.equal(evaluateBook({ ...fixture, publishedDate: '2010-01-01' }, 'fixture').fields.publishedDate.state, 'inconsistent');
  const raw = evaluateBrasilApi({ ...api, weight: 502, dimensions: '14 x 21 x 2,5 cm' }, ISBN);
  assert.equal(raw.book.weight, undefined);
  assert.equal(raw.book.width, undefined);
});

test('consolidação preenche lacunas sem sobrescrever base e preserva proveniência por campo', () => {
  const base = evaluateBook({ ...fixture, language: undefined, weight: undefined, synopsis: undefined }, 'BrasilAPI', ISBN);
  const incoming = evaluateBook({ ...fixture, publisher: 'Outra Editora', weight: .502, weightUnit: 'kg' }, 'Curitiba', ISBN);
  const before = structuredClone(base), result = consolidateBooks(base, incoming);
  assert.equal(result.blocked, false);
  assert.equal(result.book.language, 'Português');
  assert.equal(result.book.weight, 502);
  assert.equal(result.book.weightUnit, 'g');
  assert.equal(result.book.provenance.title, 'BrasilAPI');
  assert.equal(result.book.provenance.language, 'Curitiba');
  assert.equal(result.book.publisher, fixture.publisher);
  assert.ok(result.conflicts.some(conflict => conflict.field === 'publisher'));
  assert.deepEqual(base, before);
});

test('consolidação bloqueia ISBN/edição divergentes e mantém conflitos Amazon omitidos da projeção', () => {
  const base = evaluateBook(fixture, 'BrasilAPI', ISBN);
  for (const incoming of [evaluateBook({ ...fixture, edition: '2ª' }, 'Curitiba', ISBN),
    evaluateBook({ ...fixture, isbn13: '9788584390670', isbn10: '8584390677' }, 'Curitiba', ISBN),
    evaluateBook({ title: 'Sem ISBN' }, 'Curitiba', ISBN)]) {
    const result = consolidateBooks(base, incoming);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.book, base.book);
  }
  const conflicting = structuredClone(amazon);
  delete conflicting.book_info.edition;
  conflicting.campos.edicao.estado = 'inconsistente';
  conflicting.campos.edicao.motivos = ['Edições 1ª e 2ª no mesmo produto'];
  assert.equal(consolidateBooks(base, evaluateAmazonLab(conflicting)).blocked, true);
});

test('sinopse exige conteúdo de resumo; publicidade, depoimentos e texto genérico não complementam', () => {
  assert.deepEqual(synopsisReasons(synopsis), []);
  for (const text of ['Compre agora com frete grátis! ' + synopsis, 'Um clássico contemporâneo. ' + synopsis, 'Texto genérico. '.repeat(10), '<script>malicioso()</script>Resumo curto']) {
    assert.ok(synopsisReasons(text).length);
    const result = consolidateBooks(evaluateBook({ ...fixture, synopsis: undefined }, 'BrasilAPI', ISBN), evaluateBook({ ...fixture, synopsis: text }, 'Curitiba', ISBN));
    assert.equal(result.book.synopsis, undefined);
    assert.equal(result.book.description, undefined, 'Alias description não contorna rejeição de sinopse');
    assert.ok(result.conflicts.some(conflict => conflict.field === 'synopsis'));
  }
  assert.equal(evaluateBook(fixture, 'fixture').fields.synopsis.review, true);
});

test('ano e data não recebem complementação incompatível entre fontes', () => {
  const base = evaluateBook({ ...fixture, year: undefined, publishedDate: '2009-07-21' }, 'BrasilAPI', ISBN);
  const incoming = evaluateBook({ ...fixture, year: 2010 }, 'Curitiba', ISBN);
  const result = consolidateBooks(base, incoming);
  assert.equal(result.book.year, undefined);
  assert.ok(result.conflicts.some(conflict => conflict.field === 'year' && /data de publicação/.test(conflict.reason)));
});
