#!/usr/bin/env bash
# Agent bootstrap: the FIRST command of every working session (see AGENTS.md).
# Idempotent: every step checks what is already there and only fixes what is missing or stale.
#
#   bash scripts/agent-bootstrap.sh            # everything (reference + Natural Earth can take 10+ minutes once)
#   bash scripts/agent-bootstrap.sh --quick    # skip the big downloads (reference source, Natural Earth)
#
# Steps:
#   1. git: switch to the session branch, fast-forward to origin when only behind (backs up local edits first).
#      Never force-pushes, never resets a branch that has local commits, never touches other branches.
#   2. client dependencies (npm ci in client/ when node_modules or tsx/@frontline/core are missing).
#   3. Python tools for the map pipeline (/home/user/tools/maps-venv: numpy, pillow, scipy).
#   4. Browser tools for UI tests (/home/user/tools/browser: puppeteer-core, @sparticuz/chromium + system libs).
#   5. Reference: OpenFrontIO source (read-only, /home/user/reference/OpenFrontIO) and its Natural Earth inputs.
#   6. Natural Earth inputs for map pipeline (GRAY_50M_SR_W.tif, rivers geojson) into /home/user/reference/natural-earth.
#   7. Summary: one line per item, exit code 1 if something essential is still missing.
#
# Environment overrides: ARENA_TOOLS, ARENA_REFERENCE, ARENA_BACKUP.

set -uo pipefail

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="arena/f737868e-ui-test"
TOOLS="${ARENA_TOOLS:-/home/user/tools}"
REF="${ARENA_REFERENCE:-/home/user/reference}"
BACKUP="${ARENA_BACKUP:-/tmp/arena-bootstrap-backup}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
REFERENCE_REPO="openfrontio/OpenFrontIO"
RASTER_REPO="nvkelso/natural-earth-raster"
VECTOR_REPO="nvkelso/natural-earth-vector"

RESULTS=()
ESSENTIAL_MISSING=0

log()  { echo "[bootstrap] $*"; }
ok()   { RESULTS+=("OK    $1"); log "ok: $1"; }
warn() { RESULTS+=("WARN  $1"); log "warn: $1"; }
miss() { RESULTS+=("FAIL  $1"); log "FAIL: $1"; ESSENTIAL_MISSING=1; }

# ---------------------------------------------------------------- 1. git
step_git() {
	cd "$REPO" || { miss "git: repo not found at $REPO"; return; }
	if ! git fetch origin "$BRANCH" --quiet 2>/tmp/bootstrap-fetch.err; then
		miss "git fetch failed (check GitHub connection): $(tail -1 /tmp/bootstrap-fetch.err)"
		return
	fi
	if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
		git checkout -q -b "$BRANCH" --track "origin/$BRANCH" && log "created local branch $BRANCH from origin"
	fi
	local cur
	cur="$(git rev-parse --abbrev-ref HEAD)"
	if [ "$cur" != "$BRANCH" ]; then
		git checkout -q "$BRANCH" && log "switched from $cur to $BRANCH"
	fi
	local ahead behind
	ahead="$(git rev-list --count "origin/$BRANCH..HEAD")"
	behind="$(git rev-list --count "HEAD..origin/$BRANCH")"
	if [ "$ahead" = "0" ] && [ "$behind" = "0" ]; then
		ok "git: $BRANCH up to date with origin ($(git rev-parse --short HEAD))"
	elif [ "$ahead" = "0" ] && [ "$behind" != "0" ]; then
		# Only behind: local edits (if any) go to a backup before the branch moves to origin.
		mkdir -p "$BACKUP"
		if ! git diff --quiet || [ -n "$(git diff --cached --name-only)" ]; then
			git diff > "$BACKUP/worktree-$STAMP.patch"
			git diff --cached > "$BACKUP/staged-$STAMP.patch"
			log "local edits saved to $BACKUP/worktree-$STAMP.patch"
		fi
		local untracked
		untracked="$(git ls-files --others --exclude-standard | grep -v '^client/resources/textures/src/' || true)"
		if [ -n "$untracked" ]; then
			# shellcheck disable=SC2086
			tar -czf "$BACKUP/untracked-$STAMP.tgz" $untracked 2>/dev/null && log "untracked files saved to $BACKUP/untracked-$STAMP.tgz"
		fi
		git reset -q --hard "origin/$BRANCH"
		ok "git: moved $BRANCH from behind to origin/$BRANCH ($(git rev-parse --short HEAD), was $behind behind)"
	elif [ "$ahead" != "0" ] && [ "$behind" = "0" ]; then
		warn "git: $ahead local commit(s) not pushed; push when the work is ready (git push origin $BRANCH)"
	else
		miss "git: branch diverged (local $ahead ahead, $behind behind origin). Not changed: resolve manually, do not force-push"
	fi
}

# ---------------------------------------------------------------- 2. client deps
step_client_deps() {
	local c="$REPO/client"
	if [ -x "$c/node_modules/.bin/tsx" ] && [ -e "$c/node_modules/@frontline/core" ] && [ -x "$c/node_modules/.bin/vite" ]; then
		ok "client deps present"
		return
	fi
	log "client deps missing, running npm ci (1-2 min)..."
	if (cd "$c" && npm ci >"$BACKUP/npm-ci-$STAMP.log" 2>&1); then
		ok "client deps installed (npm ci)"
	else
		miss "client npm ci failed, see $BACKUP/npm-ci-$STAMP.log"
	fi
}

# ---------------------------------------------------------------- 3. python tools
step_python() {
	local py="$TOOLS/maps-venv/bin/python"
	if [ -x "$py" ] && "$py" -c "import numpy, PIL, scipy" >/dev/null 2>&1; then
		ok "python tools present (numpy, pillow, scipy)"
		return
	fi
	log "python tools missing, creating $TOOLS/maps-venv ..."
	mkdir -p "$TOOLS"
	if python3 -m venv "$TOOLS/maps-venv" && "$TOOLS/maps-venv/bin/pip" install -q numpy pillow scipy >"$BACKUP/pip-$STAMP.log" 2>&1; then
		ok "python tools installed (maps-venv)"
	else
		miss "python tools install failed, see $BACKUP/pip-$STAMP.log"
	fi
}

# ---------------------------------------------------------------- 4. browser tools
step_browser() {
	local b="$TOOLS/browser"
	if [ -e "$b/node_modules/puppeteer-core/package.json" ] && [ -e "$b/node_modules/@sparticuz/chromium/package.json" ] && [ -e "$b/libs/lib/libnss3.so" ]; then
		ok "browser tools present (puppeteer-core, chromium, libs)"
		return
	fi
	log "browser tools missing, installing into $b ..."
	mkdir -p "$b"
	[ -f "$b/package.json" ] || (cd "$b" && npm init -y >/dev/null)
	if ! (cd "$b" && npm install @sparticuz/chromium@131 puppeteer-core@23 >"$BACKUP/browser-$STAMP.log" 2>&1); then
		miss "browser npm install failed, see $BACKUP/browser-$STAMP.log"
		return
	fi
	# System libraries (libnss3 etc.) ship as a brotli-compressed tar inside @sparticuz/chromium.
	if ! (cd "$b" && node -e '
		const z = require("zlib"), fs = require("fs");
		fs.mkdirSync("libs", {recursive: true});
		fs.writeFileSync("libs/al2023.tar", z.brotliDecompressSync(fs.readFileSync("node_modules/@sparticuz/chromium/bin/al2023.tar.br")));
	' && tar -xf libs/al2023.tar -C libs); then
		miss "browser libs extraction failed"
		return
	fi
	printf '#!/usr/bin/env bash\n# Source before running browser scripts: . %s/env.sh\nexport LD_LIBRARY_PATH=%s/libs/lib\n' "$b" "$b" > "$b/env.sh"
	ok "browser tools installed. Run scripts with: LD_LIBRARY_PATH=$b/libs/lib node <script>"
}

# ---------------------------------------------------------------- 5. reference source
step_reference() {
	local dir="$REF/OpenFrontIO"
	if [ -f "$dir/package.json" ] && [ -d "$dir/src" ]; then
		ok "reference source present ($dir)"
		return
	fi
	if [ "$QUICK" = "1" ]; then
		warn "reference source missing (skipped with --quick)"
		return
	fi
	log "reference source missing, downloading $REFERENCE_REPO (read-only copy) ..."
	mkdir -p "$dir"
	if curl -sL --max-time 900 "https://codeload.github.com/$REFERENCE_REPO/tar.gz/refs/heads/main" | tar -xz -C "$dir" --strip-components=1; then
		ok "reference source downloaded ($dir)"
	else
		miss "reference download failed"
	fi
}

# ---------------------------------------------------------------- 6. Natural Earth inputs
step_natural_earth() {
	local ne="$REF/natural-earth"
	mkdir -p "$ne"
	if [ ! -f "$ne/GRAY_50M_SR_W.tif" ]; then
		if [ "$QUICK" = "1" ]; then
			warn "Natural Earth raster missing (skipped with --quick)"
		else
			log "Natural Earth raster missing: streaming it out of the raster archive (about 10 min, the archive is 6.5 GB, not kept on disk)..."
			if curl -sL --max-time 1800 "https://codeload.github.com/$RASTER_REPO/tar.gz/refs/heads/master" \
				| tar -xz -C "$ne" --wildcards "*50m_rasters/GRAY_50M_SR_W/GRAY_50M_SR_W.tif" --strip-components=3 2>/dev/null; then
				[ -f "$ne/GRAY_50M_SR_W.tif" ] && ok "Natural Earth raster GRAY_50M_SR_W.tif" || miss "Natural Earth raster not found in archive"
			else
				miss "Natural Earth raster download failed"
			fi
		fi
	else
		ok "Natural Earth raster present"
	fi
	if [ ! -f "$ne/ne_50m_rivers_lake_centerlines.geojson" ]; then
		if [ "$QUICK" = "1" ]; then
			warn "rivers geojson missing (skipped with --quick)"
		else
			log "rivers geojson missing: streaming it out of the vector archive (about 4 min)..."
			if curl -sL --max-time 1800 "https://codeload.github.com/$VECTOR_REPO/tar.gz/refs/heads/master" \
				| tar -xz -O --wildcards "*geojson/ne_50m_rivers_lake_centerlines.geojson" > "$ne/ne_50m_rivers_lake_centerlines.geojson" 2>/dev/null \
				&& [ -s "$ne/ne_50m_rivers_lake_centerlines.geojson" ]; then
				ok "rivers geojson downloaded"
			else
				rm -f "$ne/ne_50m_rivers_lake_centerlines.geojson"
				miss "rivers geojson download failed"
			fi
		fi
	else
		ok "rivers geojson present"
	fi
}

step_git
step_client_deps
step_python
step_browser
step_reference
step_natural_earth

echo
echo "=== bootstrap summary ($STAMP) ==="
printf '%s\n' "${RESULTS[@]}"
if [ "$ESSENTIAL_MISSING" = "1" ]; then
	echo "RESULT: something essential is missing (see FAIL lines)"
	exit 1
fi
echo "RESULT: environment ready"
