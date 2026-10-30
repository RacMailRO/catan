import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Wipes previous build output so stale hashed assets (old index-*.js bundles, etc.) can never
// end up in a deploy folder next to the fresh ones. Only generated folders are removed.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const rel of ['apps/web/dist', 'apps/server/dist']) {
  fs.rmSync(path.resolve(repoRoot, rel), { recursive: true, force: true });
  console.log(`[clean] removed ${rel}`);
}
