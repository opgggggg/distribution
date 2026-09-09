#!/bin/bash
# Build the signed Linux x86_64 release artifacts in a container.
#
#   .agents/skills/cubeoffice-release/linux/build-linux-x86_64.sh <output-dir>
#
# Produces, in the output directory:
#   CubeOffice_<version>_amd64.AppImage[.sig]   updater artifact and download
#   CubeOffice_<version>_amd64.deb[.sig]        download
#
# Run it from a clean checkout at the release revision: the source handed to
# the container is `git archive` of HEAD plus the submodule's HEAD, so the
# container builds exactly the committed tree and nothing from the worktree.
#
# On an Apple Silicon Mac this needs a Rosetta-backed x86_64 runtime, not QEMU.
# See "Building Linux on Apple Silicon" in ../references/release-process.md --
# linuxdeploy's subprocesses do not survive QEMU user-mode emulation.
set -euo pipefail

OUT="${1:-}"
if [ -z "$OUT" ]; then
	echo "usage: $(basename "$0") <output-dir>" >&2
	exit 2
fi
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"

IMAGE=cubeoffice-linux-builder
NAME=cubeoffice-linux-build
KEY="${OFFICE_UPDATER_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/auroraprime-office.key}"
[ -r "$KEY" ] || { echo "updater signing key not readable: $KEY" >&2; exit 1; }

REV="$(git rev-parse HEAD)"
SUB="$(git -C als-office rev-parse HEAD)"
echo "building $REV (submodule $SUB)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/src/als-office"
git archive HEAD | tar -x -C "$STAGE/src"
git -C als-office archive HEAD | tar -x -C "$STAGE/src/als-office"

docker build --platform linux/amd64 -t "$IMAGE" "$(dirname "$0")"
docker rm -f "$NAME" >/dev/null 2>&1 || true

# --device /dev/fuse and SYS_ADMIN let the AppImage tools mount themselves.
# The key is mounted read-only; TAURI_SIGNING_PRIVATE_KEY_PASSWORD must be set
# and empty, because the key is unencrypted and the profile deliberately leaves
# an empty password to the environment (see resolveProfileSigningEnv upstream).
docker run -d --platform linux/amd64 --name "$NAME" \
	--device /dev/fuse --cap-add SYS_ADMIN --security-opt apparmor:unconfined \
	-v "$KEY:/keys/updater.key:ro" \
	-e OFFICE_UPDATER_SIGNING_PRIVATE_KEY=/keys/updater.key \
	-e TAURI_SIGNING_PRIVATE_KEY_PASSWORD= \
	-e NODE_OPTIONS=--max-old-space-size=8192 \
	"$IMAGE" sleep infinity >/dev/null

docker cp "$STAGE/src/." "$NAME:/build/" >/dev/null

# Stage the AppImage tools ourselves so their AppImage marker can be cleared.
# The marker ("AI\x02" at offset 8) lives in the ELF header's ABI-version
# padding. Linux ignores those bytes; Rosetta validates them and refuses to
# exec the file at all ("ELF file ABI version invalid"). Zeroing them leaves a
# plain, runnable ELF. This touches only the build tools -- the AppImage this
# produces gets its own correct marker from the packaging tool.
docker exec "$NAME" bash -c '
set -e
mkdir -p /root/.cache/tauri && cd /root/.cache/tauri
base=https://github.com/tauri-apps/binary-releases/releases/download
curl -fsSL -o linuxdeploy-x86_64.AppImage "$base/linuxdeploy/linuxdeploy-x86_64.AppImage"
curl -fsSL -o linuxdeploy-plugin-appimage-x86_64.AppImage \
  https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage
curl -fsSL -o AppRun-x86_64 "$base/apprun-old/AppRun-x86_64"
curl -fsSL -o linuxdeploy-plugin-gtk.sh https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gtk/master/linuxdeploy-plugin-gtk.sh
curl -fsSL -o linuxdeploy-plugin-gstreamer.sh https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gstreamer/master/linuxdeploy-plugin-gstreamer.sh
chmod +x linuxdeploy-x86_64.AppImage linuxdeploy-plugin-appimage-x86_64.AppImage AppRun-x86_64 ./*.sh
for f in linuxdeploy-x86_64.AppImage linuxdeploy-plugin-appimage-x86_64.AppImage; do
	dd if=/dev/zero of="$f" bs=1 count=3 seek=8 conv=notrunc status=none
done
cp linuxdeploy-plugin-appimage-x86_64.AppImage linuxdeploy-plugin-appimage.AppImage
'

docker exec "$NAME" bash -c 'cd /build && npm ci'
docker exec "$NAME" bash -c 'cd /build && npm run desktop:build:linux-x64'

mkdir -p "$OUT"
B=/build/als-office/apps/desktop/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle
for sub in appimage deb; do
	for f in $(docker exec "$NAME" bash -c "ls $B/$sub/ 2>/dev/null" | tr -d '\r'); do
		case "$f" in
			*.AppImage|*.AppImage.sig|*.deb|*.deb.sig)
				docker cp "$NAME:$B/$sub/$f" "$OUT/$f"
				echo "  $f" ;;
		esac
	done
done

docker rm -f "$NAME" >/dev/null
echo "artifacts in $OUT"
