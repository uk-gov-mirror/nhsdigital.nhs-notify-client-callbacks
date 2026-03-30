_paths_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${_paths_dir}/../../../.." && pwd)"
clients_dir="${repo_root}/infrastructure/terraform/modules/clients"

# Follow symlinks to find the real nhs-notify-client-callbacks root
# (repo_root resolves to the workspace root, which differs in CI where the component is symlinked in)
_real_script="$(readlink -f "${BASH_SOURCE[0]}")"
bounded_context_root="$(cd "$(dirname "${_real_script}")/../../../.." && pwd)"
