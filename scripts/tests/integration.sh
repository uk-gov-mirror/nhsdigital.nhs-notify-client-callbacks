#!/bin/bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

pnpm install --frozen-lockfile

source ./scripts/tests/integration-env.sh

JEST_ARGS=()
[ -n "${TEST_FILE:-}" ] && JEST_ARGS+=("$TEST_FILE")
[ -n "${TEST_NAME:-}" ] && JEST_ARGS+=(--testNamePattern "$TEST_NAME")

pnpm run test:integration "${JEST_ARGS[@]}"
