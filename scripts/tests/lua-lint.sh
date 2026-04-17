#!/bin/bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

check=all ./scripts/githooks/check-lua-format.sh
