/**
 * build.js
 * 
 * minifies the bookmarklet source.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const targets = [
  { source: 'script.js', min: 'dist/script.min.js' },
];

const esbuild = existsSync(join(root, 'node_modules', '.bin', 'esbuild'))
  ? (flags) => execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), flags, { cwd: root, stdio: 'inherit' })
  : // No local install: let npx fetch esbuild once.
    (flags) => execFileSync('npx', ['--yes', 'esbuild@0.24.0', ...flags], { cwd: root, stdio: 'inherit' });

const kb = (n) => (n / 1024).toFixed(1) + ' KB';

for (const target of targets) {
  const flags = [
    target.source,
    '--minify',
    '--target=es2019',
    '--charset=utf8',
    '--legal-comments=none',
    // Must not emit template literals: they would put raw newlines in the URL.
    '--supported:template-literal=false',
    '--outfile=' + target.min,
  ];
  esbuild(flags);

  const code = readFileSync(join(root, target.min), 'utf8').trim();
  if (/\n/.test(code)) throw new Error('minified output is not a single line: ' + target.min);

  console.log(`${target.min}  ${kb(code.length)} (${code.length} chars)`);
}
