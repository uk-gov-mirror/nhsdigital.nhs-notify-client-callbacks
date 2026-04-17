#!/bin/bash

set -euo pipefail

# Pre-commit git hook to lint Lua files using luacheck. Runs luacheck natively
# if installed, otherwise falls back to Docker.
#
# Usage:
#   $ [options] ./check-lua-format.sh
#
# Options:
#   check={all,staged-changes,working-tree-changes,branch}  # Check mode, default is 'working-tree-changes'
#   BRANCH_NAME=other-branch-than-main                      # Branch to compare with, default is `origin/main`
#   FORCE_USE_DOCKER=true                                   # If set to true the command is run in a Docker container, default is 'false'
#   VERBOSE=true                                            # Show all the executed commands, default is `false`

# ==============================================================================

function main() {

  cd "$(git rev-parse --show-toplevel)"

  check=${check:-working-tree-changes}
  case $check in
    "all")
      files="$(git ls-files "*.lua")"
      ;;
    "staged-changes")
      files="$(git diff --diff-filter=ACMRT --name-only --cached "*.lua")"
      ;;
    "working-tree-changes")
      files="$(git diff --diff-filter=ACMRT --name-only "*.lua")"
      ;;
    "branch")
      files="$( (git diff --diff-filter=ACMRT --name-only "${BRANCH_NAME:-origin/main}" "*.lua"; git diff --name-only "*.lua") | sort | uniq )"
      ;;
    *)
      echo "Unrecognised check mode: $check" >&2 && exit 1
      ;;
  esac

  if [ -n "$files" ]; then
    # shellcheck disable=SC2155
    local globals=$(jq -r '.diagnostics.globals[]' .luarc.json | tr '\n' ' ')
    if command -v luacheck > /dev/null 2>&1 && ! is-arg-true "${FORCE_USE_DOCKER:-false}"; then
      files="$files" globals="$globals" run-luacheck-natively
    else
      files="$files" globals="$globals" run-luacheck-in-docker
    fi
  fi
}

# Run luacheck natively.
# Arguments (provided as environment variables):
#   files=[files to check]
#   globals=[space-separated list of global names]
function run-luacheck-natively() {

  # shellcheck disable=SC2086
  luacheck $files --globals $globals
}

# Run luacheck in a Docker container.
# Arguments (provided as environment variables):
#   files=[files to check]
#   globals=[space-separated list of global names]
function run-luacheck-in-docker() {

  # shellcheck disable=SC1091
  source ./scripts/docker/docker.lib.sh

  # shellcheck disable=SC2155
  local image=$(name=pipelinecomponents/luacheck docker-get-image-version-and-pull)
  # shellcheck disable=SC2086
  docker run --rm --platform linux/amd64 \
    --volume "$PWD":/data \
    --workdir /data \
    --entrypoint luacheck \
    "$image" \
      $files --globals $globals
}

# ==============================================================================

function is-arg-true() {

  if [[ "$1" =~ ^(true|yes|y|on|1|TRUE|YES|Y|ON)$ ]]; then
    return 0
  else
    return 1
  fi
}

# ==============================================================================

is-arg-true "${VERBOSE:-false}" && set -x

main "$@"

exit 0
