---
name: cubeoffice-release
description: Build, sign, stage, and publish CubeOffice desktop binaries and updater metadata for macOS, Windows, and Linux to cubexp.com. Use for CubeOffice desktop releases, binary rebuilds, or update-feed publication; do not use for als-office releases or HarmonyOS/mobile packaging.
---

# CubeOffice Release

Release the desktop application from the CubeOffice distribution repository to `cubexp.com` with reproducible source identity, signed updater artifacts, canonical filenames, and a verified update manifest.

Read [references/release-process.md](references/release-process.md) before changing a version, starting builds, collecting artifacts, or publishing.

## Scope and invariants

- Release only macOS, Windows, and Linux desktop builds.
- Keep CubeOffice identity, version, website copy, and release metadata in the distribution repository. Do not put CubeOffice-only changes into the `als-office` submodule.
- Treat `profiles/cubeoffice/desktop/catalog.mjs` → `tauriConfig.version` as the desktop version source of truth. The root `package.json` and `profiles/cubeoffice/app.json` are not desktop release version sources.
- Build all platforms from the same committed repository SHA and the same recorded submodule SHA.
- Build each target on a native host unless a maintained, already-configured runner is available. Do not claim a platform is released from an untested cross-build.
- A complete release requires four user downloads, three updater artifacts, three non-empty `.sig` files, `SHA256SUMS.txt`, and `updates/latest.json`.
- Never expose, print, commit, or upload the updater private key or its password. Signatures and the updater public key are safe release data.
- Write public release notes for end users: emphasize visible features, improvements, and fixes in plain language, and omit implementation details. Keep build identities, hashes, signing status, and other technical evidence in the internal release report instead.
- Do not overwrite an existing version on the server unless the user explicitly requests replacement. Prefer issuing a new version.
- Publish versioned files before atomically replacing `updates/latest.json`; the feed must never point at missing files.

## Release workflow

1. Inspect the repository, current desktop version, submodule revision, branch, dirty files, and existing server version. Preserve unrelated user changes.
2. Before changing the version or starting any build, fetch the distribution repository and the `als-office` submodule. Ensure the release branch includes the latest distribution default branch (currently `origin/main`) and update the submodule to its latest `origin/master`, unless the user explicitly requests another revision. Do not use an unconstrained plain `git pull`, and stop for manual resolution if synchronization conflicts with user changes.
3. Require an exact new version and user-facing release notes before changing release state. Derive the notes from verified changes since the previous release and apply the writing rules in the reference. Validate that the version is newer than the live manifest unless this is an explicitly authorized rebuild.
4. Update only the CubeOffice desktop profile and the bilingual website version/download references. Keep Chinese and English copy aligned. Run the existing formatting and configuration checks.
5. Create or identify one immutable build revision. Every native build host must report that exact main-repository SHA and submodule SHA before building.
6. Build and sign on macOS arm64, Windows x64, and Linux x86_64 using the repository commands in the reference. If one host is unavailable, stop before publishing a complete release and report the missing target.
7. Bring the five build outputs to one trusted aggregation host. Use `scripts/stage-release.mjs` to validate file signatures/magic, copy canonical filenames, calculate SHA-256 checksums, and generate the Tauri updater manifest.
8. Review the staged manifest and file list. Copy its `updates/latest.json` into `website/updates/latest.json`, then run syntax, formatting, and website link checks.
9. Upload versioned updater files and downloads first. Verify their remote sizes and hashes. Upload the website files and checksum list, then replace the live `updates/latest.json` atomically.
10. Verify every public download with HTTPS, validate all updater URLs and signatures from the live manifest, and confirm the website advertises the released version in both languages.
11. Commit and push release metadata only when the user requested repository publication. Report the build SHA, submodule SHA, artifact hashes, live URLs, verification results, and any signing/notarization limitations.

## Stop conditions

Stop without switching the live feed when any of these is true:

- platform outputs came from different source or submodule revisions;
- a required installer, updater artifact, or `.sig` is absent or empty;
- the merged Tauri config does not show `CubeOffice`, the requested version, `com.cubexp.office`, and `https://cubexp.com/updates/latest.json`;
- a staged checksum does not match the uploaded file;
- the live manifest would be partial or would reference an unavailable URL;
- publishing would overwrite an existing version without explicit authorization.

Do not delete old versions during a normal release. They remain useful for rollback and existing download links.
