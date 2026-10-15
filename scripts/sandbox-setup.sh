#!/usr/bin/env bash
# Brings a fresh (or wiped) sandbox to a working state: git sync, client deps, headless Chromium for
# screenshots and measurements, and the browser harness. Idempotent: safe to run again.
#
#   bash scripts/sandbox-setup.sh          # full setup
#   bash scripts/sandbox-setup.sh --check  # only report what is missing
#
# Chromium comes from the npm package @sparticuz/chromium (the CDN used by Playwright is blocked here).
# Its shared libraries ship inside the package and are unpacked to ~/.chr/al.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HARNESS="$HOME/.chr"
CHECK_ONLY="${1:-}"
BRANCH="arena/0330549f-ui-test"

step() { printf '\n== %s\n' "$*"; }

step "git: sync with origin/$BRANCH"
cd "$ROOT"
if [ "$CHECK_ONLY" = "--check" ]; then
  git status --short | head -5 || true
  git rev-parse --abbrev-ref HEAD
else
  git fetch -q origin
  current="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$current" != "$BRANCH" ]; then
    echo "Branch is $current, expected $BRANCH. Not switching automatically."
    exit 1
  fi
  if [ -n "$(git status --porcelain)" ]; then
    echo "Working tree has local changes; not resetting. Commit or stash them first."
  else
    git merge --ff-only "origin/$BRANCH" || echo "Cannot fast-forward; resolve manually."
  fi
fi

step "node and npm"
node --version
npm --version

step "client dependencies"
if [ -d "$ROOT/client/node_modules" ] && [ "$CHECK_ONLY" = "--check" ]; then
  echo "present"
elif [ "$CHECK_ONLY" = "--check" ]; then
  echo "MISSING: run without --check"
else
  (cd "$ROOT/client" && npm ci --no-audit --no-fund)
fi

step "headless Chromium harness in $HARNESS"
if [ "$CHECK_ONLY" = "--check" ]; then
  [ -f "$HARNESS/al/lib/libnspr4.so" ] && echo "chromium libs: present" || echo "chromium libs: MISSING"
  [ -d "$HARNESS/node_modules/puppeteer-core" ] && echo "puppeteer: present" || echo "puppeteer: MISSING"
else
  mkdir -p "$HARNESS"
  cd "$HARNESS"
  [ -f package.json ] || echo '{"name":"chr","version":"1.0.0","type":"module"}' > package.json
  if [ ! -d node_modules/puppeteer-core ] || [ ! -d node_modules/@sparticuz/chromium ]; then
    npm install --no-audit --no-fund @sparticuz/chromium puppeteer-core
  fi
  if [ ! -f al/lib/libnspr4.so ]; then
    node -e '
      const fs = require("fs"), {execSync} = require("child_process"), {brotliDecompressSync} = require("zlib");
      const dir = process.env.HOME + "/.chr/al";
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(dir + "/al.tar", brotliDecompressSync(fs.readFileSync(process.env.HOME + "/.chr/node_modules/@sparticuz/chromium/bin/al2023.tar.br")));
      execSync(`tar -xf ${dir}/al.tar -C ${dir}`);
    '
  fi
  # Smoke test: launches Chromium and renders a page.
  cp "$ROOT/scripts/browser/smoke.mjs" "$HARNESS/smoke.mjs"
  LD_LIBRARY_PATH="$HARNESS/al/lib" node "$HARNESS/smoke.mjs"
  cp "$ROOT/scripts/browser/shot.mjs" "$HARNESS/shot.mjs"
fi

step "done"
cat <<EOF
Next:
  bash scripts/run-prod.sh            # build and serve the game on port 8080 (start as a background process)
  LD_LIBRARY_PATH=$HARNESS/al/lib node $HARNESS/shot.mjs /home/user/.chr/shots
  (screenshots of menu, lobby, spawn and game; see scripts/browser/shot.mjs)
Checks: cd client && npm test && npx tsc --noEmit -p . && npx vite build
EOF
