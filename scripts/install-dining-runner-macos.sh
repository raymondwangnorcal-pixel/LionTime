#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly REPOSITORY="raymondwangnorcal-pixel/LionTime"
readonly REPOSITORY_URL="https://github.com/${REPOSITORY}"
readonly RUNNER_NAME="lionhour-dining-mac"
readonly RUNNER_LABEL="lionhour-dining"
readonly RUNNER_VERSION="2.336.0"
readonly RUNNER_ARCHIVE="actions-runner-osx-arm64-${RUNNER_VERSION}.tar.gz"
readonly RUNNER_SHA256="8e8839c49b7060b6b2154f4931f815df330c27f167d53ef2239ee3dfce28b079"
readonly RUNNER_DOWNLOAD="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly RUNNER_DIR="${REPOSITORY_ROOT}/.github-runner"
readonly USER_ID="$(id -u)"
readonly KEEP_AWAKE_LABEL="com.lionhour.dining-keep-awake"
readonly KEEP_AWAKE_PLIST="${HOME}/Library/LaunchAgents/${KEEP_AWAKE_LABEL}.plist"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  printf 'This installer requires Apple Silicon macOS.\n' >&2
  exit 1
fi

for command in awk curl gh install launchctl plutil shasum tar; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'Required command is unavailable: %s\n' "${command}" >&2
    exit 1
  fi
done

gh auth status >/dev/null
mkdir -p "${RUNNER_DIR}"
printf '{"private":true,"type":"commonjs"}\n' > "${RUNNER_DIR}/package.json"

if [[ ! -f "${RUNNER_DIR}/.runner" ]]; then
  archive_path="$(mktemp -t lionhour-actions-runner)"
  trap 'rm -f "${archive_path}"' EXIT

  curl --fail --location --silent --show-error \
    --output "${archive_path}" \
    "${RUNNER_DOWNLOAD}"

  actual_sha256="$(shasum -a 256 "${archive_path}" | awk '{print $1}')"
  if [[ "${actual_sha256}" != "${RUNNER_SHA256}" ]]; then
    printf 'Runner checksum mismatch.\n' >&2
    exit 1
  fi

  tar -xzf "${archive_path}" -C "${RUNNER_DIR}"
  registration_token="$(gh api --method POST \
    "repos/${REPOSITORY}/actions/runners/registration-token" \
    --jq .token)"

  (
    cd "${RUNNER_DIR}"
    ./config.sh \
      --unattended \
      --url "${REPOSITORY_URL}" \
      --token "${registration_token}" \
      --name "${RUNNER_NAME}" \
      --labels "${RUNNER_LABEL}" \
      --work _work \
      --replace
  )
  unset registration_token
fi

(
  cd "${RUNNER_DIR}"
  if [[ ! -f .service ]]; then
    ./svc.sh install
  fi
  ./svc.sh stop >/dev/null 2>&1 || true
  ./svc.sh start
)

mkdir -p "$(dirname "${KEEP_AWAKE_PLIST}")"
temporary_plist="$(mktemp -t lionhour-keep-awake)"
trap 'rm -f "${archive_path:-}" "${temporary_plist:-}"' EXIT

printf '%s\n' \
  '<?xml version="1.0" encoding="UTF-8"?>' \
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
  '<plist version="1.0">' \
  '<dict>' \
  '  <key>Label</key>' \
  "  <string>${KEEP_AWAKE_LABEL}</string>" \
  '  <key>ProgramArguments</key>' \
  '  <array>' \
  '    <string>/usr/bin/caffeinate</string>' \
  '    <string>-s</string>' \
  '  </array>' \
  '  <key>KeepAlive</key>' \
  '  <true/>' \
  '  <key>RunAtLoad</key>' \
  '  <true/>' \
  '  <key>ProcessType</key>' \
  '  <string>Background</string>' \
  '  <key>StandardOutPath</key>' \
  "  <string>${RUNNER_DIR}/caffeinate.log</string>" \
  '  <key>StandardErrorPath</key>' \
  "  <string>${RUNNER_DIR}/caffeinate-error.log</string>" \
  '</dict>' \
  '</plist>' > "${temporary_plist}"

plutil -lint "${temporary_plist}" >/dev/null
install -m 600 "${temporary_plist}" "${KEEP_AWAKE_PLIST}"
launchctl bootout "gui/${USER_ID}" "${KEEP_AWAKE_PLIST}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${USER_ID}" "${KEEP_AWAKE_PLIST}"
launchctl kickstart -k "gui/${USER_ID}/${KEEP_AWAKE_LABEL}"

printf 'Installed runner %s with label %s.\n' "${RUNNER_NAME}" "${RUNNER_LABEL}"
printf 'The Mac will resist idle system sleep while connected to AC power and logged in.\n'
