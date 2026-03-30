#!/bin/bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

npm ci

source ./scripts/tests/integration-env.sh

npm run test:integration
