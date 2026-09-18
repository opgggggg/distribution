#!/bin/bash
# Runs inside the existing, Rosetta-backed Debian builder. Do not use bash -l.
set -euo pipefail
set +x
root="$1" archive_sha="$2" revision="$3" upstream="$4" version="$5"
cd "$root"
echo "$archive_sha  source.tar.gz" | sha256sum -c -
# All runs of this helper share a cache, but never compile into it concurrently.
mkdir -p /cubeoffice-cache
exec 9>/cubeoffice-cache/build.lock
flock -n 9 || { echo 'Another CubeOffice Linux build owns the cache' >&2; exit 1; }
if [ ! -d source ]; then
  extraction="$(mktemp -d "$root/extract.XXXXXX")"
  tar -xzf source.tar.gz -C "$extraction"
  mv "$extraction" source
fi
cd source
node -e 'const s=require("./BUILD-IDENTITY.json");if(s.distribution!==process.argv[1]||s.upstream!==process.argv[2]||s.version!==process.argv[3])throw Error("Source identity mismatch");console.log(s.distribution,s.upstream)' "$revision" "$upstream" "$version"
command -v cargo
[ -r "$OFFICE_UPDATER_SIGNING_PRIVATE_KEY" ]
[ "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+x}" = x ]
mkdir -p /cubeoffice-cache/target
if [ ! -e als-office/apps/desktop/src-tauri/target ]; then
  ln -s /cubeoffice-cache/target als-office/apps/desktop/src-tauri/target
fi
[ "$(readlink -f als-office/apps/desktop/src-tauri/target)" = /cubeoffice-cache/target ]
# linuxdeploy's AppImage tools must already be prepared by the maintained builder.
[ -x /root/.cache/tauri/linuxdeploy-x86_64.AppImage ]
export NODE_OPTIONS=--max-old-space-size=8192
npm ci
npm run desktop:build:linux-x64
base=als-office/apps/desktop/src-tauri/target/x86_64-unknown-linux-gnu/release
file "$base/cubeoffice-app" | grep -q 'x86-64'
file als-office/apps/desktop/src-tauri/binaries/cubeoffice-x86_64-unknown-linux-gnu | grep -q 'x86-64'
[ "$(dpkg-deb -f "$base/bundle/deb/CubeOffice_${version}_amd64.deb" Version)" = "$version" ]
[ "$(dpkg-deb -f "$base/bundle/deb/CubeOffice_${version}_amd64.deb" Architecture)" = amd64 ]
als-office/apps/desktop/src-tauri/binaries/cubeoffice-x86_64-unknown-linux-gnu help
mkdir -p "$root/out"
cp "$base/bundle/appimage/CubeOffice_${version}_amd64.AppImage" "$base/bundle/appimage/CubeOffice_${version}_amd64.AppImage.sig" "$base/bundle/deb/CubeOffice_${version}_amd64.deb" "$root/out/"
