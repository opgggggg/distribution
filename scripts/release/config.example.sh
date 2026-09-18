# Copy outside Git, e.g. ~/cubexp.com/release.conf; chmod 600 that file.
# This is a trusted Bash file. Store credential PATHS here, never key/password values.
CUBEXP_SSH_HOST=root@43.159.230.137
CUBEXP_SSH_KEY="$HOME/cubexp.com/ssh/cubexp.pem"
CUBEXP_WEB_ROOT=/var/www/cubexp.com
UPDATER_KEY="$HOME/.tauri/auroraprime-office.key"
UPDATER_PUBLIC_KEY="$HOME/.tauri/auroraprime-office.key.pub"

JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/temurin-21.0.12.1/Contents/Home"
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
ANDROID_BUILD_TOOLS=35.0.0
ANDROID_KEYSTORE="$HOME/.android/cubeoffice-signing/release.jks"
ANDROID_PASSWORD_FILE="$HOME/.android/cubeoffice-signing/store-password"
ANDROID_KEY_ALIAS=cubeoffice
RELEASE_RUST_BIN=/opt/homebrew/bin

WINDOWS_HOST=ALS@192.168.64.2
WINDOWS_SSH_KEY="$HOME/.ssh/utm_win_build"
WINDOWS_VM=Windows # empty to require an already-running host
WINDOWS_ROOT=C:/src
WINDOWS_UPDATER_KEY=C:/Users/ALS/auroraprime-office.key
WINDOWS_MIN_FREE_GB=4
WINDOWS_PROXY=http://192.168.64.1:8899 # existing host-only CONNECT proxy; empty for direct access
# Optional existing cache. This script locks the cache; other builders must not use it concurrently.
WINDOWS_TARGET_CACHE=''

# Preconfigured Debian 12 amd64 container with Rosetta, Cargo, signing key and patched
# linuxdeploy tools. The existing release machine already has this container.
LINUX_DOCKER_CONTEXT=colima-rosetta
LINUX_CONTAINER=cubeoffice-linux-rosetta
