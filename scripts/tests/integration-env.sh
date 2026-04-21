#!/bin/bash

set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"

# Add new clients here: "fixture-filename.json:ENV_VAR_PREFIX"
CLIENTS=(
  "mock-client-single-target.json:MOCK_CLIENT"
  "mock-client-fan-out.json:MOCK_CLIENT_FAN_OUT"
  "mock-client-mtls.json:MOCK_CLIENT_MTLS"
  "mock-client-rate-limit.json:MOCK_CLIENT_RATE_LIMIT"
  "mock-client-circuit-breaker.json:MOCK_CLIENT_CIRCUIT_BREAKER"
)

for CLIENT_ENTRY in "${CLIENTS[@]}"; do
  FIXTURE="${CLIENT_ENTRY%%:*}"
  PREFIX="${CLIENT_ENTRY##*:}"

  SEED_CONFIG_FILE="$(pwd)/tests/integration/fixtures/subscriptions/${FIXTURE}"
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
