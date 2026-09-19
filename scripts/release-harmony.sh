#!/bin/bash
# macOS Bash 3.2 compatible. HarmonyOS is not part of the four-platform pipeline:
# AppGallery Connect has no upload API here, so this stops at a signed candidate and
# prints what a person still has to do in AGC. Everything before that is automated.
set -euo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMAND=all VERSION= NOTES= SOURCE= DRY_RUN=0
usage() {
  cat <<'EOF'
Usage: bash scripts/release-harmony.sh [COMMAND] [options]

Prepare a HarmonyOS release by writing releases/harmony-v<version>.md — the version
and the AppGallery release notes are read from it, so the usual release is:

  bash scripts/release-harmony.sh

Commands:
  all       check -> build -> sign -> report (the default)
  check     toolchain, signing material, source identity and version agreement
  build     mobile Web payload + ohpm install + hvigor assembleApp
  sign      sign the unsigned .app with the release key and verify both signatures
  report    print the candidate, its hash and what is left to do in AGC

Options:
  --version X.Y.Z   default: the highest releases/harmony-v<version>.md
  --notes FILE      default: releases/harmony-v<version>.md
  --source DIR      build from this checkout instead of the repository.
                    Use the release worktree so HarmonyOS ships the same source as
                    the other platforms:
                    ~/cubexp.com/releases/<version>/automation/source
  --dry-run         show the plan; build, sign and write nothing
  --help

The version lives in profiles/cubeoffice/app.json, which the four-platform release
writes; this script never edits it. If it disagrees with the notes file, check out
the release commit for that version (or pass --source) rather than bumping it here.
Nothing is uploaded and no version is ever replaced: an existing candidate stops the
run so a submitted package cannot be quietly rebuilt underneath the review.
EOF
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    all|check|build|sign|report) COMMAND="$1"; shift ;;
    --version|--notes|--source)
      [ "$#" -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --version) VERSION="$2" ;; --notes) NOTES="$2" ;; --source) SOURCE="$2" ;;
      esac; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# One file asks for a release, the way releases/v<version>.md does for the other
# four platforms. AppGallery shows its own "新版本特性", so these notes are separate.
if [ -z "$VERSION" ]; then
  VERSION="$(ls "$REPO"/releases/harmony-v*.md 2>/dev/null | sed 's|.*/harmony-v||; s|\.md$||' \
    | grep -E '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
  [ -n "$VERSION" ] || die 'Write releases/harmony-v<version>.md first'
fi
[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || die 'Use --version X.Y.Z'
[ -n "$NOTES" ] || NOTES="$REPO/releases/harmony-v$VERSION.md"
SOURCE="${SOURCE:-$REPO}"
WORK="$HOME/cubexp.com/releases/$VERSION/harmony"
CANDIDATE="$HOME/cubexp.com/releases/$VERSION/CubeOffice-$VERSION-release.app"

if [ "$DRY_RUN" = 1 ]; then
  printf 'Plan: %s CubeOffice HarmonyOS %s\nSource: %s\nNotes: %s\nWork: %s\nCandidate: %s\n' \
    "$COMMAND" "$VERSION" "$SOURCE" "$NOTES" "$WORK" "$CANDIDATE"
  printf '%s\n' 'check: DevEco SDK, ohpm, hvigor, release key/profile, clean source at this version' \
    'build: APP_PROFILE=cubeoffice web payload -> ohpm install -> hvigor assembleApp (release)' \
    'sign: scripts/sign-harmony-release.mjs, verifying the inner HAP and the outer APP' \
    'report: candidate path, size, SHA-256, source identity, and the AGC checklist'
  exit 0
fi

: "${DEVECO_HOME:=/Applications/DevEco-Studio.app/Contents}"
: "${DEVECO_SDK_HOME:=$DEVECO_HOME/sdk}"
: "${HARMONY_SIGNING:=$HOME/cubexp.com/harmony}"
HVIGORW="$DEVECO_HOME/tools/hvigor/bin/hvigorw"
OHPM="$DEVECO_HOME/tools/ohpm/bin/ohpm"
export DEVECO_SDK_HOME
# DevEco ships Node 18 and the repository needs 20+, so its Node goes on PATH only for
# the two commands that want it — never for the npm build.
DEVECO_PATH="$DEVECO_HOME/tools/node/bin:$PATH"

check() {
  log "Checking the toolchain and the source for HarmonyOS $VERSION"
  [ -f "$NOTES" ] && [ -s "$NOTES" ] || die "Write reviewed release notes in $NOTES"
  [ -d "$DEVECO_SDK_HOME" ] || die "No HarmonyOS SDK at $DEVECO_SDK_HOME (set DEVECO_SDK_HOME)"
  for tool in "$HVIGORW" "$OHPM" "$DEVECO_HOME/jbr/Contents/Home/bin/java"; do
    [ -x "$tool" ] || die "Missing $tool; install DevEco Studio or set DEVECO_HOME"
  done
  for file in cubeoffice-release.p12 cubeoffice-release.cer cubeoffice-release-profile.p7b store-password; do
    [ -r "$HARMONY_SIGNING/$file" ] || die "Missing signing material: $HARMONY_SIGNING/$file"
  done
  [ -d "$SOURCE/apps/harmony" ] || die "Not a distribution checkout: $SOURCE"
  # A candidate must be reproducible from a commit, so the source may not be dirty.
  git -C "$SOURCE" diff --quiet && git -C "$SOURCE" diff --cached --quiet \
    || die "Commit or stash $SOURCE first; a release is built from a commit"
  local name code
  name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["versionName"])' "$SOURCE/profiles/cubeoffice/app.json")"
  code="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["versionCode"])' "$SOURCE/profiles/cubeoffice/app.json")"
  [ "$name" = "$VERSION" ] || die "$SOURCE is at $name, not $VERSION; check out the release commit or pass --source"
  [ ! -e "$CANDIDATE" ] || die "A candidate already exists: $CANDIDATE. Archive it before building again"
  mkdir -p "$WORK"
  log "Source $(git -C "$SOURCE" rev-parse --short HEAD) / upstream $(git -C "$SOURCE" rev-parse --short HEAD:als-office), version $name ($code)"
}

build() {
  log 'Building the mobile Web payload'
  ( cd "$SOURCE" && APP_PROFILE=cubeoffice npm run build:web ) > "$WORK/web.log" 2>&1 \
    || die "Web payload build failed; see $WORK/web.log"
  log 'Resolving HarmonyOS dependencies'
  ( cd "$SOURCE/apps/harmony" && PATH="$DEVECO_PATH" "$OHPM" install --all ) > "$WORK/ohpm.log" 2>&1 \
    || die "ohpm install failed; see $WORK/ohpm.log"
  log 'Assembling the release app'
  ( cd "$SOURCE/apps/harmony" && PATH="$DEVECO_PATH" "$HVIGORW" --mode project -p product=default \
      -p buildMode=release --no-daemon assembleApp ) > "$WORK/hvigor.log" 2>&1 \
    || die "hvigor assembleApp failed; see $WORK/hvigor.log"
  [ -f "$SOURCE/apps/harmony/build/outputs/default/harmony-default-unsigned.app" ] \
    || die "No unsigned .app was produced; see $WORK/hvigor.log"
}

sign() {
  log 'Signing with the release key'
  # The signer re-checks the built identity against the profile and verifies both the
  # inner HAP and the outer APP; its JSON is the receipt for this run.
  ( cd "$SOURCE" && node scripts/sign-harmony-release.mjs ) > "$WORK/signed.json" 2>"$WORK/sign.log" \
    || die "Signing failed; see $WORK/sign.log"
  chmod 600 "$WORK/signed.json"
}

report() {
  [ -s "$WORK/signed.json" ] || die "Nothing signed yet for $VERSION"
  python3 - "$WORK/signed.json" "$NOTES" "$SOURCE" <<'PY'
import json, os, subprocess, sys
signed = json.load(open(sys.argv[1]))
notes = open(sys.argv[2], encoding='utf-8').read().strip()
source = sys.argv[3]
head = subprocess.run(['git', '-C', source, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
upstream = subprocess.run(['git', '-C', source, 'rev-parse', 'HEAD:als-office'], capture_output=True, text=True).stdout.strip()
size = os.path.getsize(signed['output'])
print()
print(f"HarmonyOS {signed['version']} ({signed['versionCode']}) — {signed['status']}")
print(f"  {signed['output']}")
print(f"  {size / 1024 / 1024:.2f} MB, SHA-256 {signed['sha256']}")
print(f"  distribution {head}, upstream {upstream}")
print()
print('Left to do by hand in AppGallery Connect (no API for these):')
for step in ['upload the package and wait for 软件包合法性 to pass',
             'paste the notes below into 新版本特性',
             'answer the permission declarations — the app reads the network state '
             '(ohos.permission.GET_NETWORK_INFO) so the workspace can tell offline from online',
             'run 上架自检 and submit for review']:
    print(f'  - {step}')
print()
print(notes)
PY
}

case "$COMMAND" in
  check) check ;;
  build) check; build ;;
  sign) check; sign ;;
  report) report ;;
  all) check; build; sign; report ;;
esac
