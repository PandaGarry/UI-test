#!/usr/bin/env node
/**
 * Architecture boundary check (step 1 of docs/ARCHITECTURE-PLAN-2026-10-16.md).
 * Report-only by default. Use --strict to exit 1 on violations (enable after the baseline reaches 0).
 * Dependency-free: scans relative imports in client/src and classifies them by top-level folder.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'client', 'src');

// Allowed dependency targets per source folder. Anything else is a violation.
// Folders not listed here are not checked yet.
const RULES = {
  protocol: ['protocol'],                 // wire format: a leaf layer shared by client and server
  game: ['game', 'map', 'util', 'event', 'protocol'], // simulation: may use protocol, map data, pure utils
  util: ['util'],                         // target: util is a leaf layer
  map: ['map', 'util', 'game', 'protocol'], // current state: map <-> game cycle is a known violation to remove
  event: ['event', 'util'],
  network: ['network', 'util', 'game', 'protocol'],
  renderer: ['renderer', 'util', 'game', 'map', 'event'],
  ui: ['ui', 'util', 'game', 'network', 'event', 'map', 'renderer', 'protocol'],
};

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep);
  const from = rel[0];
  if (!RULES[from]) continue;
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = path.normalize(path.join(path.dirname(file), spec));
    const relTarget = path.relative(SRC, target).split(path.sep)[0];
    if (!relTarget || relTarget.startsWith('..') || relTarget === from) continue;
    if (!RULES[from].includes(relTarget)) {
      violations.push({ from, to: relTarget, file: path.relative(SRC, file), spec });
    }
  }
}

const byPair = {};
for (const v of violations) {
  const k = `${v.from} -> ${v.to}`;
  byPair[k] = (byPair[k] || 0) + 1;
}
console.log(`Boundary violations: ${violations.length}`);
for (const [k, n] of Object.entries(byPair).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
if (process.argv.includes('--verbose')) for (const v of violations) console.log(`  ${v.file}: ${v.spec}`);
if (process.argv.includes('--strict') && violations.length > 0) process.exit(1);
