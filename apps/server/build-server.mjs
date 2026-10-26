import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const entryFile = path.resolve(__dirname, 'src/cli-server.ts');
const outDir = path.resolve(__dirname, 'dist');
const outFile = path.resolve(outDir, 'server.mjs');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

await esbuild.build({
  entryPoints: [entryFile],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: outFile,
  banner: {
    js: `import { createRequire as __topLevelCreateRequire } from "node:module";
const require = __topLevelCreateRequire(import.meta.url);`
  }
});

// Also copy version.json to dist so server.mjs can access it standalone
const candidateVersion = [
  path.resolve(repoRoot, 'version.json'),
  path.resolve(__dirname, 'src/version.json'),
  path.resolve(repoRoot, 'apps/web/dist/version.json')
].find((p) => fs.existsSync(p));

if (candidateVersion) {
  fs.copyFileSync(candidateVersion, path.resolve(outDir, 'version.json'));
  console.log(`Copied ${path.basename(candidateVersion)} to ${outDir}`);
}

// Copy built frontend into dist/public so server.mjs is 100% standalone and portable
const webDistSource = path.resolve(repoRoot, 'apps/web/dist');
const serverPublicDir = path.resolve(outDir, 'public');
if (fs.existsSync(webDistSource) && fs.existsSync(path.join(webDistSource, 'index.html'))) {
  fs.cpSync(webDistSource, serverPublicDir, { recursive: true });
  console.log(`Copied web frontend (${webDistSource}) to ${serverPublicDir}`);
}

console.log(`Server bundled successfully to ${outFile}`);
