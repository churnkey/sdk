// Prints, as a GitHub Actions output, the workspace packages whose
// package.json version npm does not have yet. Those are the ones a merge
// to main is asking us to publish.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

function publishedVersions(name) {
  try {
    const raw = execFileSync('npm', ['view', name, 'versions', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // npm prints a bare string when there is exactly one version.
    return [].concat(JSON.parse(raw));
  } catch (err) {
    if (String(err.stderr).includes('E404')) return []; // never published
    throw err;
  }
}

const packages = [];
for (const dir of readdirSync('packages')) {
  const pkg = JSON.parse(readFileSync(`packages/${dir}/package.json`, 'utf8'));
  if (pkg.private) continue;
  if (publishedVersions(pkg.name).includes(pkg.version)) continue;
  packages.push({ name: pkg.name, version: pkg.version, dir: `packages/${dir}`, tag: `${pkg.name}@${pkg.version}` });
}

console.error(packages.length ? `To publish: ${packages.map((p) => p.tag).join(', ')}` : 'Nothing to publish.');
console.log(`packages=${JSON.stringify(packages)}`);
