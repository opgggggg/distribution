#!/bin/bash
# macOS Bash 3.2 compatible. JSON/crypto and native Windows work live in helpers.
set -euo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HELPERS="$SCRIPT_DIR/release"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMAND=all VERSION= ANDROID_CODE= NOTES= WORK= CONFIG= DRY_RUN=0
usage() {
  cat <<'EOF'
Usage: bash scripts/release-cubeoffice.sh COMMAND --version X.Y.Z [options]

Commands:
  all       prepare -> build -> stage -> publish (resumes completed phases)
  prepare   fetch latest sources; create an isolated release worktree + commit
  build     build/sign macOS arm64, Windows x64, Linux x64, and Android
  stage     validate all outputs and create both feeds, checksums and website
  publish   upload immutable artifacts, verify HTTPS, then atomically switch feeds
  verify    read-only verification of local artifacts and the live release

Options:
  --version X.Y.Z       required, stable semantic version
  --android-code N      required for prepare/all; must exceed the live versionCode
  --notes FILE          required for prepare/all; reviewed bilingual release notes
  --work-dir DIR        default: ~/cubexp.com/releases/X.Y.Z/automation
  --config FILE         trusted Bash config; see scripts/release/config.example.sh
  --dry-run            show the plan; do not fetch, build, commit or publish
  --help

Re-run the same command/work directory after a failure. Validated platform outputs
are reused. Existing public versions cannot be replaced. No push or merge is done.
EOF
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    all|prepare|build|stage|publish|verify) COMMAND="$1"; shift ;;
    --version|--android-code|--notes|--work-dir|--config)
      [ "$#" -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --version) VERSION="$2" ;; --android-code) ANDROID_CODE="$2" ;;
        --notes) NOTES="$2" ;; --work-dir) WORK="$2" ;; --config) CONFIG="$2" ;;
      esac; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done
[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || die 'Use --version X.Y.Z'
if [ "$COMMAND" = prepare ] || [ "$COMMAND" = all ]; then
  [[ "$ANDROID_CODE" =~ ^[1-9][0-9]*$ ]] || die 'Use --android-code N'
  [ -f "$NOTES" ] && [ -s "$NOTES" ] || die 'Use --notes FILE with reviewed release notes'
fi
WORK="${WORK:-$HOME/cubexp.com/releases/$VERSION/automation}"
# Dry-run deliberately does not execute a config file, which is arbitrary shell code.
if [ "$DRY_RUN" = 1 ]; then
  printf 'Plan: %s CubeOffice %s (Android %s)\nWork: %s\nConfig: %s\n' "$COMMAND" "$VERSION" "${ANDROID_CODE:-from release.json}" "$WORK" "${CONFIG:-defaults}"
  printf '%s\n' 'prepare: isolated worktree from latest origin/main + als-office origin/master; local commit' \
    'build: macOS/Android locally; Windows over SSH; Linux in maintained Rosetta container' \
    'stage: require all four receipts, signatures, hashes, native smoke checks and feed validation' \
    'publish: reject replacement; upload -> remote hashes -> public HTTPS -> website -> feeds' \
    'verify: read-only local signatures, remote hashes, public downloads and live feeds'
  exit 0
fi
if [ -n "$CONFIG" ]; then [ -r "$CONFIG" ] || die "Cannot read $CONFIG"; source "$CONFIG"; fi
set +x
: "${CUBEXP_SSH_HOST:=root@43.159.230.137}"
: "${CUBEXP_SSH_KEY:=$HOME/cubexp.com/ssh/cubexp.pem}"
: "${CUBEXP_WEB_ROOT:=/var/www/cubexp.com}"
: "${UPDATER_KEY:=$HOME/.tauri/auroraprime-office.key}"
: "${UPDATER_PUBLIC_KEY:=$HOME/.tauri/auroraprime-office.key.pub}"
: "${WINDOWS_HOST:=ALS@192.168.64.2}"
: "${WINDOWS_SSH_KEY:=$HOME/.ssh/utm_win_build}"
: "${WINDOWS_VM:=Windows}"
: "${WINDOWS_ROOT:=C:/src}"
: "${WINDOWS_UPDATER_KEY:=C:/Users/ALS/auroraprime-office.key}"
: "${WINDOWS_TARGET_CACHE:=}"
: "${WINDOWS_MIN_FREE_GB:=4}"
: "${WINDOWS_PROXY:=http://192.168.64.1:8899}"
: "${LINUX_DOCKER_CONTEXT:=colima-rosetta}"
: "${LINUX_CONTAINER:=cubeoffice-linux-rosetta}"
: "${ANDROID_HOME:=/opt/homebrew/share/android-commandlinetools}"
: "${ANDROID_BUILD_TOOLS:=35.0.0}"
: "${ANDROID_KEYSTORE:=$HOME/.android/cubeoffice-signing/release.jks}"
: "${ANDROID_PASSWORD_FILE:=$HOME/.android/cubeoffice-signing/store-password}"
: "${ANDROID_KEY_ALIAS:=cubeoffice}"
export CUBEXP_SSH_HOST CUBEXP_SSH_KEY CUBEXP_WEB_ROOT UPDATER_PUBLIC_KEY
export WINDOWS_HOST WINDOWS_SSH_KEY WINDOWS_ROOT WINDOWS_UPDATER_KEY WINDOWS_TARGET_CACHE WINDOWS_MIN_FREE_GB WINDOWS_PROXY
export ANDROID_HOME ANDROID_BUILD_TOOLS
for tool in git node npm python3 curl ssh scp; do command -v "$tool" >/dev/null || die "Missing $tool"; done
WORK="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$WORK")"
mkdir -p "$WORK"
mkdir "$WORK/.lock" 2>/dev/null || die "Release is already running (or inspect stale lock): $WORK/.lock"
printf '%s\n' "$$" > "$WORK/.lock/pid"
PIDS=()
cleanup() {
  local status=$?
  trap - EXIT
  # Let already dispatched builders finish; their receipts make the next run resumable.
  for pid in "${PIDS[@]:-}"; do [ -z "$pid" ] || wait "$pid" 2>/dev/null || true; done
  rm -f "$WORK/.lock/pid"; rmdir "$WORK/.lock"
  [ "$status" = 0 ] || printf 'Stopped before the next phase. Logs: %s/logs; re-run to resume.\n' "$WORK" >&2
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
mkdir -p "$WORK/logs" "$WORK/artifacts"
SOURCE="$WORK/source"
meta() { python3 "$HELPERS/release.py" "$@"; }
state() { meta get "$WORK/release.json" "$1"; }
require_state() {
  [ -f "$WORK/release.json" ] || die 'Run prepare first'
  [ "$(state version)" = "$VERSION" ] || die 'Work directory belongs to another version'
  meta source-check "$WORK"
}

prepare() {
  if [ -f "$WORK/release.json" ]; then
    require_state
    [ "$(state androidVersionCode)" = "$ANDROID_CODE" ] || die 'Android code differs from saved release'
    meta notes-check "$WORK" "$NOTES"
    log 'Reusing immutable prepared source'; return
  fi
  [ ! -e "$SOURCE" ] || die "Incomplete preparation exists at $SOURCE; inspect it or choose another --work-dir"
  meta check-new "$VERSION" "$ANDROID_CODE"
  log 'Fetching latest distribution and upstream sources into an isolated worktree'
  git -C "$REPO" fetch origin
  git -C "$REPO" worktree add -b "codex/release-$VERSION" "$SOURCE" origin/main
  git -C "$SOURCE" submodule update --init --recursive
  git -C "$SOURCE/als-office" fetch origin
  git -C "$SOURCE/als-office" switch --detach origin/master
  meta prepare "$SOURCE" "$VERSION" "$ANDROID_CODE" "$NOTES"
  (
    cd "$SOURCE"
    npm install --package-lock-only --ignore-scripts
    npm ci
    npx --no-install prettier --write profiles/cubeoffice/desktop/catalog.mjs profiles/cubeoffice/app.json website/index.html website/i18n.js website/templates.html website/visio.html "releases/$VERSION.md" package-lock.json
    meta cache-bust "$SOURCE"
    node scripts/run-cubeoffice-desktop.mjs --print-config > "$WORK/config.json"
    node "$HELPERS/validate.mjs" config "$WORK/config.json" "$VERSION" "$UPDATER_PUBLIC_KEY"
    git diff --check
    git add als-office profiles/cubeoffice/desktop/catalog.mjs profiles/cubeoffice/app.json website/index.html website/i18n.js website/templates.html website/visio.html "releases/$VERSION.md" package-lock.json
    git commit -m "chore: prepare CubeOffice $VERSION four-platform release"
  ) > "$WORK/logs/prepare.log" 2>&1
  meta snapshot "$WORK" "$VERSION" "$ANDROID_CODE"
  log "Prepared $(state distribution) / $(state upstream)"
}

windows() {
  meta windows "$WORK" "$HELPERS/windows.ps1" "$1"
}
docker_run() { docker --context "$LINUX_DOCKER_CONTEXT" "$@"; }
preflight_build() {
  [ "$(uname -s)/$(uname -m)" = Darwin/arm64 ] || die 'Run this orchestrator on Apple Silicon macOS'
  for f in "$UPDATER_KEY" "$UPDATER_PUBLIC_KEY" "$ANDROID_KEYSTORE" "$ANDROID_PASSWORD_FILE" "$WINDOWS_SSH_KEY"; do [ -r "$f" ] || die "Missing credential file: $f"; done
  if [ -z "${JAVA_HOME:-}" ]; then
    JAVA_HOME="$(meta find-java)" || die 'Set JAVA_HOME to a full JDK 21+ containing javac and jlink'
  fi
  [ -x "$JAVA_HOME/bin/jlink" ] && [ -x "$JAVA_HOME/bin/javac" ] || die 'JAVA_HOME lacks javac/jlink'
  export JAVA_HOME
  for tool in apksigner zipalign aapt; do [ -x "$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS/$tool" ] || die "Missing Android build tool $tool"; done
  # The broken rustup installation from this release machine must not shadow Homebrew.
  if [ -n "${RELEASE_RUST_BIN:-}" ]; then
    PATH="$(meta rust-path "$PATH" "$RELEASE_RUST_BIN")"; export PATH
  elif [ -x /opt/homebrew/bin/rustc ]; then
    PATH="$(meta rust-path "$PATH" /opt/homebrew/bin)"; export PATH
  fi
  rustc --version; cargo --version
  if ! receipt_ok linux; then
    docker_run exec "$LINUX_CONTAINER" bash -c 'command -v cargo; test -r "$OFFICE_UPDATER_SIGNING_PRIVATE_KEY"; test "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+x}" = x' >/dev/null || die 'Start/configure the maintained Linux container; see release README'
  fi
  if receipt_ok windows; then return; fi
  if ! ssh -i "$WINDOWS_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=5 "$WINDOWS_HOST" exit >/dev/null 2>&1; then
    [ -n "$WINDOWS_VM" ] || die 'Windows SSH unavailable'
    utmctl start "$WINDOWS_VM"
    local attempt=0
    until ssh -i "$WINDOWS_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=5 "$WINDOWS_HOST" exit >/dev/null 2>&1; do
      attempt=$((attempt + 1)); [ "$attempt" -lt 36 ] || die 'Windows SSH did not become available'; sleep 5
    done
  fi
  windows preflight
}
receipt_ok() { meta receipt-check "$WORK" "$1"; }
macos_build() {
  receipt_ok macos && return 0
  cd "$SOURCE"
  OFFICE_UPDATER_SIGNING_PRIVATE_KEY="$UPDATER_KEY" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" node scripts/run-cubeoffice-desktop.mjs --target aarch64-apple-darwin
  local bundle="$SOURCE/als-office/apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle"
  codesign --verify --deep --strict "$bundle/macos/CubeOffice.app"
  hdiutil verify "$bundle/dmg/CubeOffice_${VERSION}_aarch64.dmg"
  meta mac-check "$bundle/macos/CubeOffice.app" "$VERSION"
  "$SOURCE/als-office/apps/desktop/src-tauri/binaries/cubeoffice-aarch64-apple-darwin" help
  mkdir -p "$WORK/artifacts/macos"
  cp "$bundle/dmg/CubeOffice_${VERSION}_aarch64.dmg" "$bundle/macos/CubeOffice.app.tar.gz" "$bundle/macos/CubeOffice.app.tar.gz.sig" "$WORK/artifacts/macos/"
  meta receipt "$WORK" macos
}
android_build() {
  receipt_ok android && return 0
  cd "$SOURCE"
  APP_PROFILE=cubeoffice npm run build:release -w @yaochn/als-office-android
  local out="$WORK/artifacts/android" tools="$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS"
  mkdir -p "$out"
  "$tools/zipalign" -P 16 -f 4 apps/android/app/build/outputs/apk/release/app-release-unsigned.apk "$out/aligned.apk"
  "$tools/apksigner" sign --ks "$ANDROID_KEYSTORE" --ks-key-alias "$ANDROID_KEY_ALIAS" --ks-pass "file:$ANDROID_PASSWORD_FILE" --out "$out/CubeOffice-$VERSION-Android-b$(state androidVersionCode).apk" "$out/aligned.apk"
  "$tools/apksigner" verify --verbose --print-certs "$out/CubeOffice-$VERSION-Android-b$(state androidVersionCode).apk" > "$WORK/logs/android-signature.txt"
  "$tools/aapt" dump badging "$out/CubeOffice-$VERSION-Android-b$(state androidVersionCode).apk" > "$WORK/logs/android-package.txt"
  meta android-check "$WORK"
  meta receipt "$WORK" android
}
linux_build() {
  receipt_ok linux && return 0
  local remote="/cubeoffice-releases/$VERSION-$(state distribution)"
  docker_run exec "$LINUX_CONTAINER" mkdir -p "$remote"
  docker_run cp "$WORK/source.tar.gz" "$LINUX_CONTAINER:$remote/source.tar.gz"
  docker_run cp "$HELPERS/linux.sh" "$LINUX_CONTAINER:$remote/build.sh"
  docker_run exec "$LINUX_CONTAINER" bash "$remote/build.sh" "$remote" "$(state archiveSha256)" "$(state distribution)" "$(state upstream)" "$VERSION"
  mkdir -p "$WORK/artifacts/linux"
  for name in "CubeOffice_${VERSION}_amd64.AppImage" "CubeOffice_${VERSION}_amd64.AppImage.sig" "CubeOffice_${VERSION}_amd64.deb"; do
    docker_run cp "$LINUX_CONTAINER:$remote/out/$name" "$WORK/artifacts/linux/$name"
  done
  meta receipt "$WORK" linux
}
local_build() {
  if receipt_ok macos && receipt_ok android; then return; fi
  cd "$SOURCE"
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
  npm ci
  npm run build:packages
  node --test scripts/tests/desktop-binary-name.test.mjs
  node apps/android/tests/services.cjs
  node scripts/tests/desktop-client-services.cjs
  node als-office/packages/vsdx/tests/editor-session.mjs
  macos_build & local mac_pid=$!
  android_build & local android_pid=$!
  local failed=0
  wait "$mac_pid" || failed=1
  wait "$android_pid" || failed=1
  [ "$failed" = 0 ]
}
build() {
  require_state
  if receipt_ok macos && receipt_ok android && receipt_ok linux && receipt_ok windows; then
    log "Reusing four verified platform outputs"; return
  fi
  preflight_build > "$WORK/logs/preflight.log" 2>&1
  log 'Building local macOS/Android, remote Windows and Linux; detailed logs are under logs/'
  local_build > "$WORK/logs/local-build.log" 2>&1 & PIDS+=("$!")
  linux_build > "$WORK/logs/linux-build.log" 2>&1 & PIDS+=("$!")
  windows build > "$WORK/logs/windows-build.log" 2>&1 & PIDS+=("$!")
  local failed=0 pid
  for pid in "${PIDS[@]}"; do wait "$pid" || failed=1; done
  PIDS=()
  [ "$failed" = 0 ] || die 'A platform build failed; see logs. No publication attempted.'
  meta source-check "$WORK"
  log 'All four platform builds completed'
}
stage() { require_state; meta stage "$WORK" "$HELPERS"; }
publish() {
  require_state
  meta validate-stage "$WORK/stage" "$SOURCE" "$HELPERS"
  python3 "$HELPERS/publish.py" publish "$WORK/stage" "$SOURCE" "$HELPERS" | tee "$WORK/logs/publish.log"
  meta report "$WORK"
}
verify() {
  require_state
  meta validate-stage "$WORK/stage" "$SOURCE" "$HELPERS"
  python3 "$HELPERS/publish.py" verify "$WORK/stage" "$SOURCE" "$HELPERS"
}
case "$COMMAND" in
  all) prepare; build; stage; publish ;;
  prepare) prepare ;; build) build ;; stage) stage ;; publish) publish ;; verify) verify ;;
esac
log "Completed $COMMAND. Work directory: $WORK"
