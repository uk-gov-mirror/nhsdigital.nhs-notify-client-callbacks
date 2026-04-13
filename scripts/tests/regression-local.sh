#!/bin/bash

set -euo pipefail

# Run regression tests against a live environment.
#
# Usage (via make):
#   ENVIRONMENT=<env> make test-regression-local
#   ENVIRONMENT=<env> make test-regression-local TEST_FILE=happy-path
#   ENVIRONMENT=<env> make test-regression-local TEST_NAME="should deliver a callback"
#
# Optional overrides:
#   AWS_REGION (default: eu-west-2)
#
# Required:
#   AWS_PROFILE

if [ -z "${ENVIRONMENT:-}" ]; then
  echo "Error: ENVIRONMENT must be set before running this target." >&2
  echo "Example: ENVIRONMENT=<env> make test-regression-local" >&2
  exit 1
fi

if [ -z "${AWS_PROFILE:-}" ]; then
  echo "Error: AWS_PROFILE must be set before running this target." >&2
  exit 1
fi

AWS_REGION="${AWS_REGION:-eu-west-2}"
LOG_LEVEL="${LOG_LEVEL:-debug}"
NODE_OPTIONS="${NODE_OPTIONS:---experimental-vm-modules}"
COMPONENT="callbacks"
PROJECT="nhs"

if ! aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null 2>&1; then
  echo "No active AWS SSO session for profile '$AWS_PROFILE'. Running aws sso login..."
  aws sso login --profile "$AWS_PROFILE"
fi

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)"

export AWS_PROFILE AWS_REGION LOG_LEVEL NODE_OPTIONS AWS_ACCOUNT_ID ENVIRONMENT PROJECT COMPONENT

CI=true exec ./scripts/tests/regression.sh
