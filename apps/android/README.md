# CubeOffice for Android

This Android target reuses the mobile Web editor from `apps/harmony/web` inside a native
Android WebView. The Android host provides the system document picker, chunked Save As,
local IndexedDB autosave, and external-link handling without duplicating editor code.

## Build

1. Install Android SDK Platform 35 and Build Tools 35.
2. Point `ANDROID_HOME` or `ANDROID_SDK_ROOT` at the SDK.
3. Run `npm run build:android` from the repository root.

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

Android defaults to `profiles/cubeoffice/`, copied from the CubeOffice desktop
distribution profile: display name `CubeOffice`, application ID `com.cubexp.office`,
vendor `cubexp`, URL scheme `cubeoffice`, and the shared 1024px brand icon.
The profile version is `1.2.0` (`versionCode` 1002002).
Gradle and the embedded Web build both use this profile, including direct Gradle builds.
Set `APP_PROFILE=default` to build AuroraPrime Office, or select another profile.

`npm run build:android:release` produces an unsigned release APK. Align it with
`zipalign -P 16 -f -v 4`, then sign with `apksigner` using the existing release key.
The 1.2.0 signing key is stored outside this repository at
`~/.android/cubeoffice-signing/release.jks` (alias `cubeoffice`); its password is in
`~/.android/cubeoffice-signing/store-password`. Use `--ks-pass file:<password-file>`;
the key password matches the store password, so omit `--key-pass`.
Retain and securely back up this key for compatible future Android updates.
Do not commit private keystores or passwords to this repository.

## Android interface

The Android host uses a dedicated touch workspace with file search, recent drafts,
bottom navigation, modal action sheets, and explicit reading/editing modes on
both phones and tablets. See [UX.md](./UX.md) for interaction rules, preview
instructions, validation results, and remaining device checks.

## Client services (1.2.0, build 1002001)

Settings includes a persistent random clientId, native clipboard copy, manual updates,
an opt-in automatic check once per 24 hours on app launch, and a feedback form with
category, optional contact/system version, and server-issued reference number.
The private client ID file lives in Android noBackupFilesDir and survives an APK
upgrade but is not transferred by backup. Clearing application data creates a new ID.

Native background networking calls fixed HTTPS endpoints:

- POST https://cubexp.com/api/v1/update-checks (common anonymous client fields)
- POST https://cubexp.com/api/v1/feedback (only explicit submissions)
- GET https://cubexp.com/updates/android/latest.json

The Android manifest uses versionCode, versionName, minSdk, an HTTPS cubexp.com APK
URL, sha256, and optional notes. Publish an immutable APK first, then its feed; never
reuse an old artifact filename for a different build. Display version stays aligned
with desktop; versionCode increases for Android revisions. Downloads open in the
browser and installation uses Android's normal signed-APK upgrade workflow.
The app validates feed fields and restricts links to cubexp.com/downloads/*.apk.
No document, screenshot, or automatic diagnostic log upload is implemented.

Run `node apps/android/tests/services.cjs` from the repository root for update feed
validation and asynchronous bridge failure checks. Phone-width UI tests used a local
native-bridge fixture: newer/same build, offline checks, failed feedback preserving
text, and successful feedback reference. No production feedback was sent as a test.
Physical-device installation, native clipboard and real feedback delivery still need
on-device validation; release compilation and APK signatures are checked locally.

Build 1002002 keeps version 1.2.0 and unifies boolean controls and dropdowns across
Android, desktop settings, document panels, spreadsheet panels, and the admin UI.
The bilingual privacy policy now covers Android. Shared controls: 83 editor-ui
tests, mobile Web build, DOCX/XLSX builds, targeted desktop SettingsDialog typecheck,
public API check, and release Gradle build passed. Full desktop typecheck requires
Tauri dependencies absent from this workspace. Native device testing remains pending.
