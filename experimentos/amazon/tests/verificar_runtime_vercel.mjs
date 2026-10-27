// Compilação local com o builder já instalado da CLI. Sem deploy, pull de env ou instalação.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, mkdtemp, rm, stat, realpath, symlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const cli = path.join(process.env.APPDATA || path.join(homedir(), 'AppData/Roaming'), 'npm/node_modules/vercel/package.json');
const require = createRequire(cli);
const builder = require('@vercel/node');
const { FileFsRef, FileBlob } = require('@vercel/build-utils');
const root = process.cwd();
const result = await builder.build({ files: { 'api/amazon.ts': new FileFsRef({ fsPath: path.join(root, 'api/amazon.ts') }) },
  entrypoint: 'api/amazon.ts', workPath: root, repoRootPath: root,
  config: { nodeVersion: '24.x', projectSettings: { nodeVersion: '24.x' } },
  meta: { skipDownload: true, runNpmInstallSet: new Set([path.join(root, 'package.json')]) },
});
const lambda = result.output;
assert.equal(lambda.runtime, 'nodejs24.x');
assert.equal(lambda.maxDuration, 45);
const names = Object.keys(lambda.files);
assert.ok(names.some(file => file.replaceAll('\\', '/') === 'api/amazon.js'));
assert.ok(!names.some(file => /(?:\.py$|servidor_laboratorio|servico_typescript|\.env(?:\.|$))/.test(file)));
await mkdir('.vercel', { recursive: true });
const compiled = await mkdtemp(path.join(root, '.vercel/amazon-compiled-'));
try {
  for (const [name, file] of Object.entries(lambda.files)) {
    const target = path.resolve(compiled, name);
    assert.ok(target.startsWith(compiled + path.sep), 'Artefato fora do diretório de ensaio');
    await mkdir(path.dirname(target), { recursive: true });
    if (file.fsPath && (await stat(file.fsPath)).isDirectory()) {
      // O workspace reaproveita node_modules por junction; não ler o diretório como arquivo.
      await symlink(await realpath(file.fsPath), target, 'junction');
      continue;
    }
    const { data } = await FileBlob.fromStream({ stream: file.toStream() });
    await writeFile(target, data);
  }
  const loaded = await import(pathToFileURL(path.join(compiled, lambda.handler)));
  const handler = loaded.default?.fetch || loaded.default?.default?.fetch;
  assert.equal(typeof handler, 'function');
  const response = await handler(new Request('https://preview.example.invalid/api/amazon'));
  assert.equal(response.status, 401, 'Artefato real deve negar consulta anônima sem acessar a rede');
} finally {
  const parent = path.resolve(root, '.vercel') + path.sep;
  assert.ok(compiled.startsWith(parent) && path.basename(compiled).startsWith('amazon-compiled-'));
  await rm(compiled, { recursive: true, force: true });
}
const evidence = { resultado: 'aprovado', builder: '@vercel/node', versao_builder: require('@vercel/node/package.json').version,
  runtime: lambda.runtime, maxDuration: lambda.maxDuration, handler: lambda.handler,
  arquivos_compilados: names.length, inicializacao_artefato_real: true, consulta_anonima: 401,
  instalacao: false, deploy: false, consultas_externas: 0 };
await mkdir('experimentos/amazon/relatorios/vercel', { recursive: true });
await writeFile('experimentos/amazon/relatorios/vercel/runtime.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
