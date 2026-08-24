# AuroraPrime Office for Android

This Android target reuses the mobile Web editor from `apps/harmony/web` inside a native
Android WebView. The Android host provides the system document picker, chunked Save As,
local IndexedDB autosave, and external-link handling without duplicating editor code.

## Build

1. Install Android SDK Platform 35 and Build Tools 35.
2. Point `ANDROID_HOME` or `ANDROID_SDK_ROOT` at the SDK.
3. Run `npm run build:android` from the repository root.

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

Release builds use the normal Android Gradle signing configuration. Do not commit private
keystores or passwords to this repository.
