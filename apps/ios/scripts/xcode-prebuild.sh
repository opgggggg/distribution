#!/bin/sh
# Xcode's counterpart to the Android project's `preBuild` dependencies: refresh the
# generated identity from profiles/<profile>/app.json and rebuild the mobile Web
# payload before the app target compiles.
#
# Set AURORA_SKIP_WEB_SYNC=1 to keep the payload already in the tree. Xcode builds are
# far more frequent than Gradle ones during native work, and the Vite build is minutes.
set -eu

# XcodeGen inlines this file's contents into a wrapper script under DerivedData, so
# $0 points there and is useless for locating the project. Xcode exports SRCROOT (the
# .xcodeproj's directory); the $0 fallback is only for running this by hand.
project_root="${SRCROOT:-$(cd -- "$(dirname -- "$0")/.." && pwd)}"
cd "$project_root"
if [ ! -f scripts/sync-app-profile.mjs ]; then
	echo "error: expected to be in apps/ios, but $(pwd) has no scripts/sync-app-profile.mjs" >&2
	exit 1
fi

# Xcode runs build phases with a minimal PATH that has neither Homebrew nor a version
# manager's shims on it.
if ! command -v node >/dev/null 2>&1; then
	for candidate in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
		if [ -x "$candidate/node" ]; then
			PATH="$candidate:$PATH"
			export PATH
			break
		fi
	done
fi
if ! command -v node >/dev/null 2>&1; then
	echo "error: node is not on PATH. Build once from a terminal with \`npm run build:ios\`, or add node to this build phase's PATH." >&2
	exit 1
fi

node ../../scripts/sync-app-profile.mjs --ios
node scripts/sync-app-profile.mjs

if [ "${AURORA_SKIP_WEB_SYNC:-0}" = "1" ]; then
	echo "AURORA_SKIP_WEB_SYNC=1: keeping the mobile Web payload already in App/Resources/web"
	exit 0
fi
node scripts/sync-web.mjs
