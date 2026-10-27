// Somente processos/HTTP locais. Nenhuma pesquisa por ISBN ou acesso à Amazon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { address, assertPortAvailable, runOnline } from '../experimentos/amazon/iniciar_online.mjs';

function context(t) {
  const messages = [], signals = new EventEmitter(), children = [];
  t.after(() => {
    // Uma regressão no supervisor não pode deixar processos de teste em execução.
    for (const child of children) if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
  });
  const logger = { log: value => messages.push(value), error: value => messages.push(value) };
  const dummy = (code) => {
    const child = spawn(process.execPath, ['-e', code === undefined ? 'setInterval(()=>{},1000)' : `process.exit(${code})`],
      { stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' });
    children.push(child);
    return child;
  };
  return { messages, signals, children, logger, dummy };
}
const waitUntilAborted = signal => delay(60000, undefined, { signal });
function assertStopped(children) {
  for (const child of children) {
    assert.ok(child.exitCode !== null || child.signalCode !== null || !child.pid, `Processo ${child.pid} continua ativo`);
  }
}

test('comando único preserva os comandos individuais', async () => {
  const { scripts } = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(scripts['dev:amazon:online'], 'node experimentos/amazon/iniciar_online.mjs');
  assert.equal(scripts['lab:amazon'], 'node experimentos/amazon/iniciar_laboratorio.mjs');
  assert.equal(scripts['dev:amazon'], 'vite --host 127.0.0.1 --port 3000 --strictPort');
});

for (const port of [3000, 8765]) test(`porta ${port} ocupada gera mensagem clara sem iniciar nem encerrar outro serviço`, async t => {
  const occupied = createServer();
  occupied.listen({ host: '127.0.0.1', port, exclusive: true });
  await once(occupied, 'listening');
  const ctx = context(t);
  try {
    const exitCode = await runOnline({ signalSource: ctx.signals, logger: ctx.logger,
      startService: () => assert.fail('Não iniciar TypeScript com porta ocupada'),
      startVite: () => assert.fail('Não iniciar Vite com porta ocupada') });
    assert.equal(exitCode, 1);
    assert.match(ctx.messages.join('\n'), new RegExp(`Porta ${port} já está ocupada`));
    assert.equal(occupied.listening, true, 'Não encerrar o serviço anterior');
    assert.equal(ctx.signals.listenerCount('SIGINT'), 0);
  } finally { await new Promise(resolve => occupied.close(resolve)); }
});

test('erro ao criar Vite encerra TypeScript e retorna falha', async t => {
  const ctx = context(t);
  const exitCode = await runOnline({ signalSource: ctx.signals, logger: ctx.logger, checkPort: async () => {},
    startService: () => ctx.dummy(),
    startVite: () => spawn('isbn-nonexistent-executable-test', [], { stdio: 'ignore', windowsHide: true }),
    waitReady: waitUntilAborted });
  assert.equal(exitCode, 1);
  assert.match(ctx.messages.join('\n'), /Falha ao iniciar Interface React\/Vite/);
  assertStopped(ctx.children);
});

for (const failure of ['TypeScript', 'Vite']) test(`falha de ${failure} encerra o serviço restante`, async t => {
  const ctx = context(t);
  const exitCode = await runOnline({ signalSource: ctx.signals, logger: ctx.logger, checkPort: async () => {},
    startService: () => ctx.dummy(failure === 'TypeScript' ? 23 : undefined),
    startVite: () => ctx.dummy(failure === 'Vite' ? 23 : undefined), waitReady: waitUntilAborted });
  assert.equal(exitCode, 1);
  assert.match(ctx.messages.join('\n'), /encerrou inesperadamente \(código 23\)/);
  assertStopped(ctx.children);
});

test('falha ao iniciar TypeScript é explicada e não inicia Vite', async t => {
  const ctx = context(t);
  assert.equal(await runOnline({ signalSource: ctx.signals, logger: ctx.logger, checkPort: async () => {},
    startService: () => { throw new Error('Falha no runtime TypeScript.'); }, startVite: () => assert.fail('Não iniciar Vite') }), 1);
  assert.match(ctx.messages.join('\n'), /Falha no runtime TypeScript/);
});

test('prazo de inicialização excedido encerra ambos os processos', async t => {
  const ctx = context(t);
  assert.equal(await runOnline({ signalSource: ctx.signals, logger: ctx.logger, checkPort: async () => {},
    startService: () => ctx.dummy(), startVite: () => ctx.dummy(), waitReady: waitUntilAborted, startupTimeoutMs: 100 }), 1);
  assert.match(ctx.messages.join('\n'), /não ficaram prontos no prazo/);
  assertStopped(ctx.children);
});

test('Ctrl+C durante inicialização também limpa os dois processos', async t => {
  const ctx = context(t);
  assert.equal(await runOnline({ signalSource: ctx.signals, logger: ctx.logger, checkPort: async () => {},
    startService: () => ctx.dummy(), startVite: () => ctx.dummy(),
    waitReady: async signal => { ctx.signals.emit('SIGINT'); await waitUntilAborted(signal); } }), 0);
  assertStopped(ctx.children);
  assert.match(ctx.messages.join('\n'), /Laboratório Amazon e Vite encerrados/);
});

test('falha depois da prontidão também encerra o serviço restante', async t => {
  const ctx = context(t);
  const result = await runOnline({ signalSource: ctx.signals, logger: ctx.logger, checkPort: async () => {},
    startService: () => ctx.dummy(), startVite: () => ctx.dummy(),
    waitReady: async () => { setImmediate(() => ctx.children[0].kill()); } });
  assert.equal(result, 1);
  assert.ok(ctx.messages.some(message => message.includes('Laboratório Amazon pronto:')));
  assert.match(ctx.messages.join('\n'), /encerrou inesperadamente/);
  assertStopped(ctx.children);
});

test('serviços reais: Vite → proxy → TypeScript com HTTP habilitado; SIGINT libera ambas as portas', { timeout: 60000 }, async t => {
  const ctx = context(t);
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const logger = { error: ctx.logger.error, log(value) { ctx.logger.log(value); if (value.includes('Laboratório Amazon pronto:')) ready(); } };
  const running = runOnline({ signalSource: ctx.signals, logger });
  t.after(async () => { ctx.signals.emit('SIGINT'); await running; });
  await Promise.race([started, running.then(code => assert.fail(`Não iniciou: ${code}\n${ctx.messages.join('\n')}`))]);
  assert.ok(ctx.messages.includes(`Laboratório Amazon pronto: ${address}`));
  for (const endpoint of [`${address}/__amazon_lab/health`, 'http://127.0.0.1:8765/__amazon_lab/health']) {
    const response = await fetch(endpoint, { headers: { 'X-ISBN-Lab': 'local-development' }, signal: AbortSignal.timeout(3000), redirect: 'error' });
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.http_habilitado, true);
    assert.equal(health.persistencia, false);
  }
  const page = await fetch(address, { signal: AbortSignal.timeout(3000) });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src\/main\.tsx/);
  const fixture = await fetch(`${address}/__amazon_lab/search`, {
    method: 'POST', headers: { 'X-ISBN-Lab': 'local-development', Origin: address, 'Content-Type': 'application/json' },
    body: JSON.stringify({ isbn: '9788501014863', modo: 'fixture' }), signal: AbortSignal.timeout(3000),
  });
  assert.equal(fixture.status, 200);
  const result = await fixture.json();
  assert.equal(result.status_http, null);
  assert.equal(result.imagens.itens.length, 4);
  assert.equal(result.book_info.additionalImages.length, 3);
  assert.ok(ctx.messages.every(message => !/Python/i.test(message)));
  ctx.signals.emit('SIGINT');
  assert.equal(await running, 0);
  await assertPortAvailable(3000);
  await assertPortAvailable(8765);
});
