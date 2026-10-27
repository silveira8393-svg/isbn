// Ensaio no navegador com contexto de usuário sintético e API real de fixtures.
// A página temporária é removida ao final; não cria bypass de login no aplicativo.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const lab = path.join(root, 'experimentos/amazon');
const outputDirectory = path.join(lab, 'relatorios', ...(process.argv.includes('--migracao-typescript') ? ['migracao_typescript'] : []));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const temporary = await mkdtemp(path.join(lab, '.ui-test-'));
let browser;
try {
  const bundle = await build({ bundle: true, write: false, format: 'esm', jsx: 'automatic',
    define: { 'import.meta.env.DEV': 'true', 'process.env.NODE_ENV': '"development"' },
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Context} from 'lab-test-context';
      import Settings from './src/components/SettingsView';
      function Preview() {
        const [role,setRole]=useState('developer');
        return <Context.Provider value={{currentUser:{id:role,role,active:true,name:'Teste local'},canViewDeveloperTools:role==='developer'}}>
          <nav aria-label="Perfis sintéticos de teste">{['developer','admin','operator'].map(r=><button key={r} onClick={()=>setRole(r)}>{r}</button>)}</nav>
          <Settings/>
        </Context.Provider>;
      }
      createRoot(document.getElementById('root')).render(<Preview/>);
    ` },
    plugins: [{ name: 'fixture-context-only', setup(builder) {
      builder.onResolve({ filter: /UserContext|^lab-test-context$/ }, () => ({ path: 'context', namespace: 'mock' }));
      builder.onResolve({ filter: /MagazordTestMode|UserManagement|ConditionTemplateManager|InfrastructureEntry/ }, () => ({ path: 'empty', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', resolveDir: root,
        contents: args.path === 'context' ? "import {createContext,useContext} from 'react'; export const Context=createContext(null); export const useUser=()=>useContext(Context);" : 'export default ()=>null',
      }));
    } }],
  });
  await writeFile(path.join(temporary, 'preview.js'), bundle.outputFiles[0].text);
  await writeFile(path.join(temporary, 'index.html'), '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><link rel="stylesheet" href="/src/index.css"><title>Verificação isolada do laboratório</title><div id="root"></div><script type="module" src="./preview.js"></script></html>');
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const external = [], errors = [], queries = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { external.push(url.hostname); return route.abort(); }
    if (url.pathname.endsWith('/search')) queries.push(route.request().postDataJSON());
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  const urlPath = path.relative(root, temporary).split(path.sep).join('/');
  await page.goto(`http://127.0.0.1:3000/${urlPath}/index.html`);
  await page.getByRole('button', { name: 'Laboratório Amazon', exact: true }).click();
  await page.getByText('AMBIENTE EXPERIMENTAL — NÃO INTEGRADO AO CADASTRO', { exact: true }).waitFor();
  await page.getByLabel('Origem da consulta', { exact: true }).selectOption('fixture');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await page.locator('[aria-label="Resultado bibliográfico experimental"]').waitFor();
  assert.match(await page.locator('body').innerText(), /O alquimista/);
  assert.match(await page.locator('body').innerText(), /8\/9 válidos locais/);
  assert.match(await page.locator('body').innerText(), /Exige revisão humana/);
  assert.equal(await page.locator('dt').count(), 9);
  assert.equal(await page.locator('#amazon-lab-mode option[value=http]').isDisabled(), false);
  assert.equal(await page.getByRole('checkbox').count(), 0);
  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({ path: path.join(outputDirectory, 'laboratorio_fixture.png'), fullPage: true });
  await page.getByLabel('ISBN-10 ou ISBN-13', { exact: true }).fill('8535914846');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await page.getByText('George Orwell', { exact: true }).waitFor();
  assert.equal(await page.locator('dt').count(), 9);
  for (const role of ['admin', 'operator']) {
    await page.getByRole('button', { name: role, exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Laboratório Amazon', exact: true }).count(), 0);
    assert.equal(await page.getByText('AMBIENTE EXPERIMENTAL — NÃO INTEGRADO AO CADASTRO', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Amazon Marketplace', exact: true }).count(), 1);
  }
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.modo === 'fixture'));
  assert.ok(external.every(host => host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com'));
  assert.deepEqual(errors, []);
  const denied = await page.request.post('http://127.0.0.1:3000/__amazon_lab/search', {
    headers: { Host: 'evil.test', Origin: 'http://127.0.0.1:3000', 'X-ISBN-Lab': 'local-development' },
    data: { isbn: '9788584390670', modo: 'fixture' },
  });
  assert.equal(denied.status(), 404, 'Proxy must deny requests with a non-local Host');
  const evidence = { resultado: 'aprovado', origem: 'contexto_sintetico_de_perfis_com_componentes_reais',
    fluxo: 'SettingsView -> AmazonLab -> proxy Vite -> servidor TypeScript -> extrator TypeScript -> fixtures',
    fixtures: ['9788584390670', '8535914846'], campos_por_livro: 9, validos_por_livro: 8,
    perfis_sem_acesso: ['admin', 'operator'], http_real: 'disponível; ensaio usa somente fixtures',
    erros_javascript: errors, requisicoes_de_pesquisa: queries.length };
  await writeFile(path.join(outputDirectory, 'verificacao_interface.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser?.close();
  const resolved = path.resolve(temporary);
  if (!resolved.startsWith(lab + path.sep) || !path.basename(resolved).startsWith('.ui-test-')) throw new Error('Diretório temporário fora do laboratório.');
  await rm(resolved, { recursive: true, force: true });
}
