// Mesmo Vite/configuração do comando dev:amazon, com encerramento coordenado por IPC.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let server, stopping = false;
async function stop() {
  stopping = true;
  if (server) {
    await server.close();
    process.exit(0); // Fecha o canal do esbuild, que encerra seu subprocesso.
  }
}
process.on('message', message => { if (message === 'shutdown') void stop(); });
process.on('disconnect', () => { void stop(); });
for (const signal of ['SIGINT', 'SIGTERM', ...(process.platform === 'win32' ? ['SIGBREAK'] : [])]) {
  process.on(signal, () => { void stop(); });
}
try {
  server = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)),
    server: { host: args[args.indexOf('--host') + 1], port: Number(args[args.indexOf('--port') + 1]), strictPort: args.includes('--strictPort') },
    clearScreen: false,
  });
  if (stopping) await stop();
  else { await server.listen(); server.printUrls(); }
} catch (error) {
  console.error(`Falha na interface React/Vite: ${error.message}`);
  if (server) await server.close();
  process.exit(1);
}
