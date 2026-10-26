import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

console.log(`Server bundled successfully to ${outFile}`);
