# This script is run before Terraform apply for the callbacks component.
# It installs dependencies, generates any required build artefacts,
# and builds lambda workspaces.

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../../.." && pwd)"

pnpm install --frozen-lockfile

pnpm run generate-dependencies

pnpm run --recursive --if-present lambda-build
