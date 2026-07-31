#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-}"
output_directory="${2:-${repository_root}/rpm-dist}"

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 <major.minor.patch> [output-directory]" >&2
  exit 2
fi

for command_name in node pnpm; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "required command not found: ${command_name}" >&2
    exit 1
  fi
done

package_version="$(node -p "require('${repository_root}/package.json').version")"
if [[ "${version}" != "${package_version}" ]]; then
  echo "RPM version ${version} does not match package.json version ${package_version}" >&2
  exit 1
fi

cd "${repository_root}"
pnpm bundle
mkdir -p "${output_directory}"

PACKAGE_VERSION="${version}" pnpm exec nfpm package \
  --config packaging/nfpm.yaml \
  --packager rpm \
  --target "${output_directory}/ask-hermes-mcp-${version}-1.noarch.rpm"
