#!/bin/bash

set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"

CLIENTS=(
  "mock-client-regression.json:MOCK_CLIENT_REGRESSION"
)

for CLIENT_ENTRY in "${CLIENTS[@]}"; do
  FIXTURE="${CLIENT_ENTRY%%:*}"
  PREFIX="${CLIENT_ENTRY##*:}"

  SEED_CONFIG_FILE="$(pwd)/tests/regression/fixtures/subscriptions/${FIXTURE}"
  CLIENT_ID=$(jq -r '.clientId' "${SEED_CONFIG_FILE}")

  echo "Retrieving client config for ${CLIENT_ID}"
  CLIENT_CONFIG=$(pnpm run --silent clients:get \
    --client-id "${CLIENT_ID}" \
    --environment "${ENVIRONMENT}" \
    --region "${AWS_REGION}")

  echo "Retrieving application ID for ${CLIENT_ID}"
  APPLICATION_ID=$(pnpm run --silent applications-map:get \
    --client-id "${CLIENT_ID}" \
    --environment "${ENVIRONMENT}" \
    --region "${AWS_REGION}")

  export "${PREFIX}_API_KEY=$(echo "${CLIENT_CONFIG}" | jq -r '.targets[0].apiKey.headerValue')"
  export "${PREFIX}_APPLICATION_ID=${APPLICATION_ID}"
done
