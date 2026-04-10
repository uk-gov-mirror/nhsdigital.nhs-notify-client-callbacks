#!/bin/bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Run TypeScript type checking across all workspaces
pnpm install --frozen-lockfile
pnpm run typecheck
