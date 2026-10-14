#!/usr/bin/env bash
# Production start: install deps if needed, build the client, then serve it.
# Used by `npm start` so a fresh checkout (or a git pull) always serves the
# current sources instead of a stale build.
set -e
cd "$(dirname "$0")/../client"
if [ ! -d node_modules ]; then
  echo "Installing client dependencies..."
  npm ci
fi
echo "Building client..."
npm run build-prod
cd ..
exec node scripts/serve.js
