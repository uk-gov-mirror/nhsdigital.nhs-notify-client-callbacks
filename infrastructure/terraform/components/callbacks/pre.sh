# This script is run before the Terraform apply command.
# It ensures dependencies are installed, generates local client config files
# for terraform from S3-held subscriptions, and builds lambda workspaces.

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_paths.sh
source "${script_dir}/_paths.sh"

# Resolve tfvar overrides
tfvar_value() {
  local key="$1" file="$2"
  # Extract the value after '=', stripping surrounding whitespace and quotes
  grep -E "^\s*${key}\s*=" "${file}" | tail -1 | sed 's/.*=\s*//;s/\s*$//;s/^"//;s/"$//'
}

deploy_mock_clients="false"
deploy_perf_runner="false"
for _tfvar_file in \
  "${base_path}/etc/group_${group}.tfvars" \
  "${base_path}/etc/env_${region}_${environment}.tfvars"; do
  if [ -f "${_tfvar_file}" ]; then
    _val=$(tfvar_value deploy_mock_clients "${_tfvar_file}")
    [ -n "${_val}" ] && deploy_mock_clients="${_val}"
    _val=$(tfvar_value deploy_perf_runner "${_tfvar_file}")
    [ -n "${_val}" ] && deploy_perf_runner="${_val}"
  fi
done
echo "deploy_mock_clients resolved to: ${deploy_mock_clients}"
echo "deploy_perf_runner resolved to: ${deploy_perf_runner}"

pnpm install --frozen-lockfile

pnpm run generate-dependencies

"${script_dir}/sync-client-config.sh"

if [ "${deploy_mock_clients}" == "true" ]; then
  cp "${bounded_context_root}/tests/integration/fixtures/subscriptions/"*.json "${clients_dir}/"
  echo "Copied mock client subscription config fixtures into clients dir"
fi

if [ "${deploy_perf_runner}" == "true" ]; then
  cp "${bounded_context_root}/tests/performance/fixtures/subscriptions/"*.json "${clients_dir}/"
  echo "Copied perf client subscription config fixtures into clients dir"
fi

pnpm run --recursive --if-present lambda-build
