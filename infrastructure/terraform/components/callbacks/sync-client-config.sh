#!/usr/bin/env bash

# Seeds local client subscription JSON files from S3 into modules/clients/ before Terraform runs.
# Terraform reads those files via fileset() to build local.config_clients.
# On first apply the bucket may not exist yet; this is handled gracefully.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_paths.sh
source "${script_dir}/_paths.sh"

: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"
: "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID must be set}"

cd "${repo_root}"

rm -f "${clients_dir}"/*.json

bucket_name="nhs-${AWS_ACCOUNT_ID}-${AWS_REGION}-${ENVIRONMENT}-callbacks-subscription-config"

s3_prefix="client_subscriptions/"

echo "Seeding client configs from s3://${bucket_name}/${s3_prefix} for ${ENVIRONMENT}/${AWS_REGION}"

if ! sync_output=$(aws s3 sync "s3://${bucket_name}/${s3_prefix}" "${clients_dir}/" \
  --region "${AWS_REGION}" \
  --exclude "*" \
  --include "*.json" \
  --only-show-errors 2>&1); then
  if [[ "${sync_output}" == *"NoSuchBucket"* ]]; then
    # Expected on first apply before Terraform creates the bucket.
    echo "Client config bucket not found yet; skipping sync for first run"
  else
    echo "Failed to sync client config from S3" >&2
    echo "${sync_output}" >&2
    exit 1
  fi
fi

# Ensure an empty directory produces a zero-length array rather than a literal "*.json" entry.
shopt -s nullglob
seeded_files=("${clients_dir}"/*.json)
seeded_count="${#seeded_files[@]}"
shopt -u nullglob

echo "Seeded ${seeded_count} client config file(s)"
