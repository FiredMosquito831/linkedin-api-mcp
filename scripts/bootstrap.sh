#!/usr/bin/env bash
# One-time setup for linkedin-api-mcp on Linux or macOS.
#
#   1. installs the npm package (or uses this checkout)
#   2. downloads the Chromium build Playwright needs
#   3. registers the MCP server with Claude Code, Codex, opencode and Antigravity
#   4. reports what is missing
#
# Usage, from a clone of this repository:
#   bash scripts/bootstrap.sh                       # every harness, global scope
#   bash scripts/bootstrap.sh owner/repo            # a different marketplace source
#   TARGETS="claude codex" SCOPE=project bash scripts/bootstrap.sh
#   SKIP_BROWSER=1 bash scripts/bootstrap.sh         # skip the Chromium download
#   SKIP_NPM=1 bash scripts/bootstrap.sh             # use the checkout, do not install
#
# Nothing here contacts LinkedIn. Authentication is a separate, explicit step.

set -euo pipefail

SOURCE="${1:-FiredMosquito831/linkedin-api-mcp}"
TARGETS="${TARGETS:-all}"
SCOPE="${SCOPE:-global}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$PWD"

if [ "${SKIP_NPM:-0}" != "1" ]; then
  echo "==> npm package"
  if command -v npm >/dev/null 2>&1; then
    npm install -g linkedin-api-mcp
  else
    echo "   npm is not on PATH. Install Node.js >= 22.12.0 from nodejs.org, then run this script again."
    exit 1
  fi
else
  echo "==> npm package: skipped, using the checkout at $ROOT"
fi

if [ "${SKIP_BROWSER:-0}" != "1" ]; then
  echo "==> Chromium for the browser adapters (one-time download, about 150 MB)"
  # Playwright does not download a browser on install; this step is required
  # before any experimental browser operation can run.
  if command -v npx >/dev/null 2>&1; then
    npx --yes playwright install chromium
  else
    echo "   npx is not on PATH. Run 'npx playwright install chromium' once Node.js is installed."
  fi
fi

echo "==> Registering the MCP server in: $TARGETS (scope: $SCOPE)"
if command -v linkedin >/dev/null 2>&1; then
  CLI=linkedin
else
  CLI="node $ROOT/bin/linkedin.js"
fi
# shellcheck disable=SC2086
# shellcheck disable=SC2086
"$CLI" install $TARGETS --scope "$SCOPE" --source "$SOURCE" --yes

echo "==> Doctor"
"$CLI" doctor

echo
echo "Next steps:"
echo "  linkedin auth login      import an official OAuth token, or use 'linkedin auth login --oauth'"
echo "  linkedin experimental browser login --experimental   sign in for the browser adapters"
