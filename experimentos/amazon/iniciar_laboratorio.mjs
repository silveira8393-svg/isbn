import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
export function startLaboratory(args = []) {
  return spawn(process.execPath, [path.join(directory, 'servico_typescript.mjs'), ...args],
    { stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const child = startLaboratory(process.argv.slice(2));
    child.on('error', () => { console.error('Não foi possível iniciar o serviço local.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
