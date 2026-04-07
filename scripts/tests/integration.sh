#!/bin/bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

npm ci

source ./scripts/tests/integration-env.sh

JEST_ARGS=()
[ -n "${TEST_FILE:-}" ] && JEST_ARGS+=("$TEST_FILE")
[ -n "${TEST_NAME:-}" ] && JEST_ARGS+=(--testNamePattern "$TEST_NAME")

npm run test:integration --workspace tests/integration -- "${JEST_ARGS[@]}"
