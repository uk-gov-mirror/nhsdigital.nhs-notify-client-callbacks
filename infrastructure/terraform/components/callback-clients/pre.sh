# This script is run before Terraform apply for the callback-clients component.
# It installs dependencies, syncs client config from S3 into modules/clients/,
# copies mock/perf fixtures when needed, and builds lambda workspaces.

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../../.." && pwd)"
clients_dir="${repo_root}/infrastructure/terraform/modules/clients"

_real_script="$(readlink -f "${BASH_SOURCE[0]}")"
bounded_context_root="$(cd "$(dirname "${_real_script}")/../../../.." && pwd)"

# Resolve deploy_mock_clients and deploy_perf_runner from tfvars
deploy_mock_clients="false"
deploy_perf_runner="false"
for _tfvar_file in \
  "${base_path}/etc/group_${group}.tfvars" \
  "${base_path}/etc/env_${region}_${environment}.tfvars"; do
  if [[ -f "${_tfvar_file}" ]]; then
    _val=$(grep -E '^\s*deploy_mock_clients\s*=' "${_tfvar_file}" | tail -1 | sed 's/.*=\s*//;s/\s*$//')
    [ -n "${_val}" ] && deploy_mock_clients="${_val}"
    _val=$(grep -E '^\s*deploy_perf_runner\s*=' "${_tfvar_file}" | tail -1 | sed 's/.*=\s*//;s/\s*$//')
    [ -n "${_val}" ] && deploy_perf_runner="${_val}"
  fi
done
echo "deploy_mock_clients resolved to: ${deploy_mock_clients}"
echo "deploy_perf_runner resolved to: ${deploy_perf_runner}"

pnpm install --frozen-lockfile

pnpm run generate-dependencies

"${script_dir}/../callbacks/sync-client-config.sh"

if [ "${deploy_mock_clients}" == "true" ]; then
  cp "${bounded_context_root}/tests/integration/fixtures/subscriptions/"*.json "${clients_dir}/"
  echo "Copied mock client subscription config fixtures into clients dir"
fi

if [ "${deploy_perf_runner}" == "true" ]; then
  cp "${bounded_context_root}/tests/performance/fixtures/subscriptions/"*.json "${clients_dir}/"
  echo "Copied perf client subscription config fixtures into clients dir"
fi

pnpm run --recursive --if-present lambda-build
