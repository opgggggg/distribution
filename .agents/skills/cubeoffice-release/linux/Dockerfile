# Linux x86_64 release builder for CubeOffice.
#
# Debian 12 keeps glibc old enough that the AppImage stays broadly usable and
# carries the webkit2gtk 4.1 that Tauri v2 links against.
#
# libfuse2, not fuse3: AppImages embed the FUSE 2 runtime and load
# libfuse.so.2 to mount themselves. With only fuse3 installed, linuxdeploy --
# itself an AppImage -- fails with `dlopen(): error loading libfuse.so.2`,
# which Tauri reports only as `failed to run linuxdeploy`.
FROM rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl file libappindicator3-dev libgtk-3-dev \
      librsvg2-dev libssl-dev libwebkit2gtk-4.1-dev patchelf wget \
      ca-certificates xz-utils libfuse2 desktop-file-utils \
 && rm -rf /var/lib/apt/lists/*

# Node 20+ is required; Debian 12 ships 18.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
