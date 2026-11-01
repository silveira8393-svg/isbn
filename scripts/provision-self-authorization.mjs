import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// No env-file loading and no secret arguments. Use a trusted local secrets manager.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    // Compile the shared TypeScript crypto in memory with the project's existing esbuild.
    // No copied encryption implementation, generated files or runtime HTTP endpoint.
    const compiled = await build({ entryPoints: [fileURLToPath(new URL('../server/spapi/provision.ts', import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent' });
    const { runProvisionCli } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
    process.exitCode = await runProvisionCli();
  } catch {
    console.error('Provisioning aborted: provisioning_failed');
    process.exitCode = 1;
  }
}
