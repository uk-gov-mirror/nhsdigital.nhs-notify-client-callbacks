# This script is run before the Terraform apply command.
# It ensures dependencies are installed, generates local client config files
# for terraform from S3-held subscriptions, and builds lambda workspaces.

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_paths.sh
source "${script_dir}/_paths.sh"

# Resolve deploy_mock_clients from tfvars; base_path/group/region/environment are in scope from terraform.sh
deploy_mock_clients="false"
for _tfvar_file in \
  "${base_path}/etc/group_${group}.tfvars" \
  "${base_path}/etc/env_${region}_${environment}.tfvars"; do
  if [ -f "${_tfvar_file}" ]; then
    _val=$(grep -E '^\s*deploy_mock_clients\s*=' "${_tfvar_file}" | tail -1 | sed 's/.*=\s*//;s/\s*$//')
    [ -n "${_val}" ] && deploy_mock_clients="${_val}"
  fi
done
echo "deploy_mock_clients resolved to: ${deploy_mock_clients}"

npm ci

npm run generate-dependencies --workspaces --if-present

"${script_dir}/sync-client-config.sh"

if [ "${deploy_mock_clients}" == "true" ]; then
  shopt -s nullglob
  existing_configs=("${clients_dir}"/*.json)
  shopt -u nullglob
  if [ "${#existing_configs[@]}" -eq 0 ]; then
    cp "${bounded_context_root}/tests/integration/fixtures/subscriptions/"*.json "${clients_dir}/"
    echo "Copied mock client subscription config fixtures into clients dir"
  else
    echo "Client configs already present from S3 sync; skipping fixture copy"
  fi
fi

npm run lambda-build --workspaces --if-present
