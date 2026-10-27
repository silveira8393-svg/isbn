// Supervisor local dos dois serviços existentes.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startLaboratory } from './iniciar_laboratorio.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const host = '127.0.0.1';
export const address = `http://${host}:3000`;

export function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? `Porta ${port} já está ocupada em ${host}. Encerre o serviço que a utiliza e tente novamente.`
      : `Não foi possível usar ${host}:${port}: ${error.message}`)));
    probe.listen({ host, port, exclusive: true }, () => probe.close(error => error ? reject(error) : resolve()));
  });
}

function startFrontend() {
  // Reutiliza exatamente os argumentos do comando individual, sem shell intermediário.
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const [command, ...args] = pkg.scripts['dev:amazon'].trim().split(/\s+/);
  if (command !== 'vite' || args.some(arg => /[;&|<>]/.test(arg)) ||
    args[args.indexOf('--host') + 1] !== host || args[args.indexOf('--port') + 1] !== '3000' || !args.includes('--strictPort')) {
    throw new Error('Comando dev:amazon não reconhecido. Esperado: vite --host 127.0.0.1 --port 3000 --strictPort.');
  }
  return spawn(process.execPath, [fileURLToPath(new URL('./servico_vite.mjs', import.meta.url)), ...args],
    { cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
}

function childClosed(child, timeoutMs) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      child.removeListener('close', onClose);
      error ? reject(error) : resolve();
    };
    const onClose = () => finish();
    const timer = setTimeout(() => finish(new Error(`Processo ${child.pid} não encerrou no prazo.`)), timeoutMs);
    child.once('close', onClose);
  });
}

export async function terminateProcess(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  // Vite fecha o servidor e seus recursos via IPC, inclusive no Windows.
  // O serviço TypeScript é filho direto, sem shell intermediário.
  const closed = childClosed(child, 8000);
  const fallback = setTimeout(() => child.kill(), 5000);
  try {
    if (child.connected) child.send('shutdown', error => { if (error) child.kill(); });
    else child.kill();
    await closed;
  } finally { clearTimeout(fallback); }
}

async function waitForServices(signal) {
  while (!signal.aborted) {
    try {
      const response = await fetch(`${address}/__amazon_lab/health`, {
        headers: { 'X-ISBN-Lab': 'local-development' }, redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
      });
      const health = response.ok ? await response.json() : null;
      if (health?.http_habilitado === true && health.persistencia === false) return;
    } catch { /* Aguarda apenas a inicialização local, sem consultas à Amazon. */ }
    await delay(150, undefined, { signal });
  }
  signal.throwIfAborted();
}

export async function runOnline({
  startService = () => startLaboratory(), startVite = startFrontend,
  checkPort = assertPortAvailable, waitReady = waitForServices, startupTimeoutMs = 45000,
  signalSource = process, logger = console,
} = {}) {
  const children = [];
  const cancellation = new AbortController();
  let stopping = false, finish;
  const stopped = new Promise(resolve => { finish = resolve; });
  const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGBREAK'] : ['SIGINT', 'SIGTERM'];
  const onSignal = () => { void stop(0, 'Encerrando o Laboratório Amazon e o Vite…'); };

  async function stop(exitCode, message) {
    if (stopping) return stopped;
    stopping = true;
    cancellation.abort();
    if (message) (exitCode ? logger.error : logger.log).call(logger, message);
    const results = await Promise.allSettled(children.map(({ child }) => terminateProcess(child)));
    for (const result of results) if (result.status === 'rejected') {
      exitCode = 1;
      logger.error(`Falha no encerramento: ${result.reason.message}`);
    }
    for (const signal of signals) signalSource.removeListener(signal, onSignal);
    if (exitCode === 0) logger.log('Laboratório Amazon e Vite encerrados.');
    finish(exitCode);
    return exitCode;
  }

  function watch(name, child) {
    children.push({ name, child });
    child.once('error', error => { void stop(1, `Falha ao iniciar ${name}: ${error.message}`); });
    child.once('exit', (code, signal) => {
      if (!stopping) void stop(1, `${name} encerrou inesperadamente (${signal || `código ${code}`}). Encerrando os dois serviços.`);
    });
  }

  for (const signal of signals) signalSource.on(signal, onSignal);
  try {
    // Verifica ambas antes de criar processos; não encerra serviços que já estavam abertos.
    await checkPort(8765);
    await checkPort(3000);
    if (stopping) return stopped;
    logger.log('Iniciando TypeScript Amazon em 127.0.0.1:8765 e Vite em 127.0.0.1:3000…');
    watch('Serviço TypeScript Amazon', startService());
    watch('Interface React/Vite', startVite());
    const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(startupTimeoutMs)]);
    try { await waitReady(signal); }
    catch (error) {
      if (stopping) return stopped;
      throw new Error(signal.aborted ? 'Os serviços não ficaram prontos no prazo. Verifique os erros acima e as portas 3000/8765.' : error.message);
    }
    if (!stopping) {
      logger.log(`Laboratório Amazon pronto: ${address}`);
      logger.log('HTTP real disponível diretamente. Pressione Ctrl+C para encerrar ambos.');
    }
  } catch (error) {
    if (!stopping) void stop(1, `Não foi possível iniciar o laboratório: ${error.message}`);
  }
  return stopped;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runOnline();
}
