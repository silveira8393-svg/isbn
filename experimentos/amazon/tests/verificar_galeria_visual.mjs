// Ensaio visual: SVGs locais por padrão; --referencias-estrangeiro carrega somente
// as URLs de imagens da evidência sanitizada, sem nova consulta à página do livro.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { loadTypeScript } from '../runtime_typescript.mjs';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureDirectory = path.join(root, 'experimentos/amazon/tests/fixtures');
const migration = process.argv.includes('--migracao-typescript');
const outputDirectory = path.join(root, 'experimentos/amazon/relatorios', ...(migration ? ['migracao_typescript'] : []));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const files = ['capa-autoral.svg', 'contracapa-autoral.svg', 'miolo-autoral.svg', 'capa-miniatura-autoral.svg'];
const assets = new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(fixtureDirectory, file), 'utf8')])));
const source = JSON.parse(await readFile(path.join(root, 'experimentos/amazon/relatorios/reais/02_9788584390670.json'), 'utf8'));
let response = { ...source, status: 'concluida', modo: 'fixture', duracao_ms: 1, status_http: null,
  book_info: { id: 'visual-fixture', title: 'Livro sintético' },
  imagens: { download_realizado: false,
    itens: files.map((file, index) => ({ referencia: `https://isbn-fixtures.invalid/${file}`,
      papel: index ? 'adicional' : 'principal', origem: '#fixture-autoral',
      disponibilidade_tecnica: 'referencia_identificada_nao_verificada' })) },
};
const realImages = process.argv.includes('--referencias-estrangeiro');
if (realImages || migration) {
  const { parseAmazonHtml, toLabResult } = await loadTypeScript(new URL('../extrator_amazon.ts', import.meta.url));
  const html = await readFile(path.join(fixtureDirectory, 'amazon_estrangeiro_9788501014863_galeria_sanitizada.html'), 'utf8');
  response = toLabResult(parseAmazonHtml(html, '9788501014863', 'memoria', 'real_html_sanitizado'), 'fixture');
}
const realReferences = new Set(response.imagens.itens.flatMap(item => [item.referencia, item.miniatura].filter(Boolean)));
// Homologa URLs e origens extraídas em TS, servindo somente os SVGs autorais em memória.
const migrationAssets = new Map(migration ? response.imagens.itens.flatMap((item, index) => [
  [item.referencia, assets.get(files[index])], ...(item.miniatura ? [[item.miniatura, assets.get('capa-miniatura-autoral.svg')]] : []),
]) : []);
const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import AmazonLab from './src/components/AmazonLab';
  let response = ${JSON.stringify(response)};
  window.__localRequests = [];
  window.fetch = async url => {
    window.__localRequests.push(String(url));
    if (!String(url).startsWith('/__amazon_lab/')) throw new Error('Requisição inesperada');
    return new Response(JSON.stringify(String(url).endsWith('health') ? {http_habilitado:true, fixtures:[], persistencia:false} : response),
      {headers:{'Content-Type':'application/json'}});
  };
  createRoot(document.getElementById('root')).render(<AmazonLab/>);
` }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cssFile = (await readdir(path.join(root, 'dist/assets'))).find(file => file.endsWith('.css'));
const css = await readFile(path.join(root, 'dist/assets', cssFile), 'utf8');
let browser;
try {
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const imageRequests = [], denied = [], errors = [], loaded = [], failed = [];
  page.on('requestfailed', request => {
    if (realReferences.has(request.url())) failed.push({ referencia: request.url(), erro: request.failure()?.errorText });
  });
  page.on('response', async resource => {
    if (realImages && realReferences.has(resource.url())) loaded.push({ referencia: resource.url(), status_http: resource.status() });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const file = url.pathname.slice(1);
    if (!realImages && migrationAssets.has(url.href)) {
      imageRequests.push(url.href);
      return route.fulfill({ contentType: 'image/svg+xml', body: migrationAssets.get(url.href) });
    }
    if (!realImages && url.hostname === 'isbn-fixtures.invalid' && assets.has(file)) {
      imageRequests.push(file);
      return route.fulfill({ contentType: 'image/svg+xml', body: assets.get(file) });
    }
    if (realImages && realReferences.has(url.href) && route.request().resourceType() === 'image') {
      imageRequests.push(url.href);
      return route.continue();
    }
    denied.push(url.hostname);
    return route.abort();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Galeria — fixture autoral local</title><style>' + css + '</style><body class="bg-slate-50 p-6"><div id="root" class="mx-auto max-w-4xl"></div></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  assert.equal(await page.getByRole('checkbox').count(), 0);
  assert.equal(await page.getByLabel('Origem da consulta', { exact: true }).inputValue(), 'http');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  const gallery = page.locator('[aria-label="Capa e imagens adicionais"]');
  await gallery.waitFor();
  await gallery.getByRole('button', { name: 'Imagem adicional 3', exact: true }).waitFor();
  await gallery.scrollIntoViewIfNeeded();
  try {
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('[aria-label="Capa e imagens adicionais"] img'));
      return images.length === 5 && images.every(img => img.complete && img.naturalWidth > 0);
    });
  } catch (error) {
    const evidence = { resultado: 'falha_carregamento', carregamentos_remotos: loaded, falhas: failed,
      texto_galeria: await gallery.innerText(), consultas_externas_pagina_livro: 0 };
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, realImages ? 'verificacao_galeria_real.json' : 'verificacao_galeria_visual.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.error(JSON.stringify(evidence, null, 2));
    throw error;
  }
  assert.equal(await gallery.getByRole('button').count(), 4);
  await gallery.getByRole('button', { name: 'Imagem adicional 3', exact: true }).click();
  assert.equal(await gallery.getByRole('img', { name: /^Imagem do livro / }).getAttribute('src'), response.imagens.itens[3].referencia);
  await gallery.getByRole('button', { name: 'Capa principal', exact: true }).click();
  assert.equal(await gallery.getByRole('img', { name: /^Capa do livro / }).getAttribute('src'), response.imagens.itens[0].referencia);
  await page.waitForFunction(() => {
    const cover = document.querySelector('img[alt^="Capa do livro "]');
    return cover?.complete && cover.naturalWidth > 0;
  });
  assert.equal(await gallery.locator('details').getAttribute('open'), null);
  await gallery.getByRole('img', { name: /^Capa do livro / }).evaluate(async img => {
    await img.decode();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await mkdir(outputDirectory, { recursive: true });
  if (!realImages) await gallery.screenshot({ path: path.join(outputDirectory, 'galeria_autoral_visual.png') });
  // Uma segunda pesquisa também deve renderizar diretamente, sem confirmação.
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await gallery.getByRole('button', { name: 'Imagem adicional 3', exact: true }).waitFor();
  await gallery.locator('summary').click();
  assert.ok((await gallery.innerText()).includes(response.imagens.itens[0].origem));
  assert.ok((await page.evaluate(() => window.__localRequests)).every(url => url.startsWith('/__amazon_lab/')));
  assert.deepEqual(errors, []);
  const dimensions = await gallery.locator('img').evaluateAll(images => images.map(img => ({
    referencia: img.src, largura: img.naturalWidth, altura: img.naturalHeight,
  })));
  assert.ok(dimensions.every(image => image.largura > 0 && image.altura > 0));
  const evidence = { resultado: 'aprovado', contexto: realImages
    ? 'componentes reais, resposta extraída offline da evidência sanitizada e imagens reais via CDN'
    : migration ? 'componentes reais, extrator TypeScript, slots DIV sanitizados e SVGs autorais interceptados localmente' : 'componentes reais e fixture autoral local',
    capa: 1, adicionais: 3, confirmacoes: 0, selecao_miniatura: true, pesquisas_sucessivas: true,
    diagnostico_recolhido: true, imagens_servidas_por_interceptacao_local: realImages ? 0 : imageRequests.length,
    consultas_externas_pagina_livro: 0, carregamentos_remotos: realImages ? loaded : [], dimensoes_renderizadas: dimensions,
    conexoes_externas: realImages ? imageRequests.length : 0, hosts_bloqueados: [...new Set(denied)], erros_javascript: errors };
  await writeFile(path.join(outputDirectory, realImages ? 'verificacao_galeria_real.json' : 'verificacao_galeria_visual.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser?.close(); }
