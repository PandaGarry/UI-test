#!/usr/bin/env bash
# One-command start (Replit "Run" button): install deps and build on first
# run only, then serve the production build.
set -e
cd "$(dirname "$0")/../client"
if [ ! -d node_modules ]; then
  echo "Installing client dependencies (first run)..."
  npm ci
fi
if [ ! -f out/index.html ]; then
  echo "Building client (first run)..."
  npm run build-prod
fi
cd ..
exec node scripts/serve.js
