// Usa o esbuild já instalado pelo projeto. Compilação em memória, sem artefatos temporários.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export async function loadTypeScript(url) {
  const compiled = await build({ entryPoints: [fileURLToPath(url)], bundle: true, write: false,
    platform: 'node', format: 'esm', target: 'node22', define: { 'import.meta.url': JSON.stringify(url.href) } });
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
}
