import { loadTypeScript } from './runtime_typescript.mjs';
try {
  const { startServer } = await loadTypeScript(new URL('./servidor_laboratorio.ts', import.meta.url));
  startServer(process.argv.slice(2));
} catch (error) {
  console.error(`Falha no laboratório TypeScript: ${error.message}`);
  process.exitCode = 1;
}
