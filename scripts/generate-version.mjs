import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

let versionData = {
  version: 'v1.0-dev',
  commitCount: 0,
  shortHash: 'dev',
  buildDate: new Date().toISOString(),
  releaseNotes: []
};

// If a previous version.json exists, keep it as fallback
const rootVersionPath = path.resolve(repoRoot, 'version.json');
if (fs.existsSync(rootVersionPath)) {
  try {
    versionData = JSON.parse(fs.readFileSync(rootVersionPath, 'utf-8'));
  } catch {
    // ignore
  }
}

try {
  const commitCount = parseInt(
    execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' }).trim(),
    10
  );
  const shortHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf-8'
  }).trim();
  const logRaw = execFileSync(
    'git',
    ['log', '-50', '--pretty=format:%h%x1f%ad%x1f%s', '--date=short'],
    { cwd: repoRoot, encoding: 'utf-8' }
  );
  const releaseNotes = logRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date, message] = line.split('\x1f');
      return { hash: hash ?? '', date: date ?? '', message: message ?? '' };
    });

  if (Number.isFinite(commitCount) && commitCount > 0) {
    versionData = {
      version: `v1.${commitCount}`,
      commitCount,
      shortHash,
      buildDate: new Date().toISOString(),
      releaseNotes
    };
  }
} catch (err) {
  console.warn('⚠️ [generate-version] Git command failed, using cached/fallback version info:', err.message);
}

const jsonContent = JSON.stringify(versionData, null, 2);

// Target destinations
const targets = [
  rootVersionPath,
  path.resolve(repoRoot, 'apps/web/public/version.json'),
  path.resolve(repoRoot, 'apps/web/dist/version.json'),
  path.resolve(repoRoot, 'apps/server/dist/version.json'),
  path.resolve(repoRoot, 'apps/server/src/version.json')
];

for (const target of targets) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    // Only create directories for public or src or root; don't create dist if not yet built
    if (target.includes('dist') && !fs.existsSync(path.dirname(dir))) {
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, jsonContent, 'utf-8');
  console.log(`[generate-version] Wrote version (${versionData.version}, ${versionData.commitCount} commits) to ${path.relative(repoRoot, target)}`);
}
