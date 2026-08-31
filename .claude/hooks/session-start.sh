#!/bin/bash
# SessionStart hook — installs Node dependencies so tests, typecheck, and lint
# work immediately in Claude Code on the web sessions. Synchronous + idempotent.
set -euo pipefail

# Only needed in the remote (web) environment; local devs already have deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# `npm install` (not `ci`) so the cached container layer is reused on resume.
npm install --no-audit --no-fund
