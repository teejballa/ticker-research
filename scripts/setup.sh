#!/usr/bin/env bash
# scripts/setup.sh
# Validates local prerequisites before npm start.
set -euo pipefail

echo "Checking prerequisites..."

# Node.js >= 18
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
if [[ "$NODE_VERSION" == "none" ]]; then
  echo "ERROR: Node.js 18+ required. Install from https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "ERROR: Node.js 18+ required (found $NODE_VERSION). Install from https://nodejs.org"
  exit 1
fi

# Python 3.10+
PYTHON_CMD=""
for cmd in python3 python; do
  if $cmd --version 2>/dev/null | grep -qE "Python 3\.(1[0-9]|[2-9][0-9])"; then
    PYTHON_CMD=$cmd
    break
  fi
done
if [[ -z "$PYTHON_CMD" ]]; then
  echo "ERROR: Python 3.10+ not found. Install from https://www.python.org"
  exit 1
fi

# ANTHROPIC_API_KEY
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set."
  echo "Add it to your shell profile or create a .env.local file:"
  echo "  ANTHROPIC_API_KEY=your-key-here"
  exit 1
fi

echo "All prerequisites met."
