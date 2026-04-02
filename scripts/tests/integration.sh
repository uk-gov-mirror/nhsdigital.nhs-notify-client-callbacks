#!/bin/bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

pnpm install --frozen-lockfile

source ./scripts/tests/integration-env.sh

pnpm run test:integration
