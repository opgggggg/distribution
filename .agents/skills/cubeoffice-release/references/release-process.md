# CubeOffice desktop release process

## Repository and release target

- Distribution repository marker: `profiles/cubeoffice/desktop/catalog.mjs`
- Upstream source submodule: `als-office`
- Product identifier: `com.cubexp.office`
- Update endpoint: `https://cubexp.com/updates/latest.json`
- Web root: `/var/www/cubexp.com`
- Default SSH target: `root@cubexp.com`
- SSH key: resolve from `CUBEXP_SSH_KEY` or an explicitly supplied path; never commit the key

Resolve and validate all paths before using them. Allow an explicitly supplied SSH target or key to override these defaults.

## Preflight

From the distribution repository, inspect and preserve any existing work before synchronizing:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git submodule status -- als-office
git fetch origin
git rev-parse origin/main
git -C als-office fetch origin
git -C als-office rev-parse origin/master
```

The distribution revision must include the latest `origin/main`, and the recorded `als-office` submodule revision must be updated to its latest `origin/master`, before any version edit or build begins. Use the path that matches the distribution release branch:

```bash
# When releasing main
git switch main
git pull --ff-only origin main

# When releasing another branch, after confirming the worktree is clean
git rebase origin/main

# Update the upstream application submodule to its master branch tip
git -C als-office switch --detach origin/master
git add als-office
```

Do not use plain `git pull`: it may create an unintended merge commit. Do not stash, discard, or overwrite user changes automatically. If the worktree is dirty or synchronization conflicts, preserve the state and stop for resolution. After synchronization, initialize the exact submodule revision recorded by the distribution repository and capture both identities:

```bash
git submodule update --init --recursive
git rev-parse HEAD
git rev-parse HEAD:als-office
git -C als-office rev-parse HEAD
```

The last two commands must match. Continue the remaining environment checks only after the source identity is fixed:

```bash
node --version
npm --version
npm run desktop:config --silent
curl -fsS https://cubexp.com/updates/latest.json
```

Inspect the merged config rather than the upstream `tauri.conf.json`. It must contain:

- `productName: CubeOffice`
- requested `version`
- `identifier: com.cubexp.office`
- `bundle.createUpdaterArtifacts: true`
- updater endpoint `https://cubexp.com/updates/latest.json`

The current profile inherits the Tauri updater public key and maps the signing inputs from:

- `OFFICE_UPDATER_SIGNING_PRIVATE_KEY`
- `OFFICE_UPDATER_SIGNING_PRIVATE_KEY_PASSWORD`

These environment variable names are historical. They still sign CubeOffice. Never print their values.

## Version changes

Change the desktop release version in:

- `profiles/cubeoffice/desktop/catalog.mjs` → `tauriConfig.version`
- visible version labels and download URLs in `website/index.html`
- matching Chinese keys and English translations in `website/i18n.js`

Do not update `profiles/cubeoffice/app.json` for a desktop-only release. Do not change the root `package.json` merely to match the desktop app.

Use `rg` to find every old-version reference, edit with `apply_patch`, then run Prettier and `npm run desktop:config --silent` again.

## User-facing release notes

Write release notes so a non-technical user can quickly understand what changed:

- Lead with new or improved things the user can do, followed by fixes that affect normal use.
- Describe the visible behavior and benefit in plain language. Prefer short action-and-outcome bullets such as “You can now send feedback with a screenshot, making problems easier to diagnose.”
- Base every statement on verified changes since the previous released revision. Do not advertise unfinished, internal-only, or unverified work.
- Omit commit hashes, internal APIs, storage schemas, frameworks, dependency upgrades, refactors, build-system changes, signing mechanics, and deployment details. Mention compatibility, migration, privacy, or security changes only when users need to know or act, and explain the user impact rather than the implementation.
- Keep the public summary concise and avoid generic phrases such as “various optimizations.” Group related small fixes into one understandable outcome.
- When release notes appear in both Chinese and English, keep their meaning aligned and make each version read naturally rather than translating word for word.

Use this public wording for the updater manifest and website. Keep source SHA values, artifact hashes, signing status, build-host details, and verification evidence in the internal release report, not in the public notes.

## Native builds

All hosts must check out the same committed distribution SHA with the same `als-office` submodule SHA. Install locked dependencies using the repository's established dependency setup before building.

macOS arm64, on Apple Silicon macOS:

```bash
npm run desktop:build -- --target aarch64-apple-darwin
```

Windows x64, on Windows:

```powershell
npm run desktop:build:win-x64
```

Linux x86_64, on Linux:

```bash
npm run desktop:build:linux-x64
```

The build requires the updater signing environment. `--no-updater-artifacts` is suitable only for a deliberately unsigned installer-only diagnostic build; it cannot satisfy a production release.

Locate outputs below `als-office/apps/desktop/src-tauri/target` instead of assuming a single target directory. Select outputs from the intended target and current build, not merely the newest unrelated file.

Required inputs for aggregation:

| Target       | User download          | Updater artifact  | Signature         |
| ------------ | ---------------------- | ----------------- | ----------------- |
| macOS arm64  | `.dmg`                 | `.app.tar.gz`     | `.app.tar.gz.sig` |
| Windows x64  | `-setup.exe`           | same `-setup.exe` | `-setup.exe.sig`  |
| Linux x86_64 | `.AppImage` and `.deb` | same `.AppImage`  | `.AppImage.sig`   |

## Deterministic staging

Place all five outputs on one trusted machine, then run from the distribution repository root:

```bash
node .agents/skills/cubeoffice-release/scripts/stage-release.mjs \
  --version 1.2.0 \
  --notes "Chinese and English release notes" \
  --output /absolute/path/to/empty-stage \
  --mac-dmg /absolute/path/to/CubeOffice.dmg \
  --mac-updater /absolute/path/to/CubeOffice.app.tar.gz \
  --windows /absolute/path/to/CubeOffice-setup.exe \
  --linux-appimage /absolute/path/to/CubeOffice.AppImage \
  --linux-deb /absolute/path/to/CubeOffice.deb
```

The script requires each updater `.sig` beside its artifact. It produces:

```text
downloads/CubeOffice-<version>-macOS-arm64.dmg
downloads/CubeOffice-<version>-Windows-x64-setup.exe
downloads/CubeOffice-<version>-Linux-x86_64.AppImage
downloads/CubeOffice-<version>-Linux-x86_64.deb
downloads/SHA256SUMS.txt
updates/<version>/CubeOffice-<version>-macOS-arm64.app.tar.gz[.sig]
updates/<version>/CubeOffice-<version>-Windows-x64-setup.exe[.sig]
updates/<version>/CubeOffice-<version>-Linux-x86_64.AppImage[.sig]
updates/latest.json
```

Copy the generated manifest to `website/updates/latest.json` with `apply_patch` or a normal formatting/copy command, then verify it with a JSON parser.

## Server publication order

Before upload, confirm that `/var/www/cubexp.com/downloads/CubeOffice-<version>-...` and `/var/www/cubexp.com/updates/<version>` do not already exist. If they do, stop unless replacement was explicitly authorized.

Use a remote staging directory under `/var/www/cubexp.com/.release-staging/`. Upload and verify in this order:

1. `updates/<version>/` artifacts and signatures.
2. `downloads/` versioned installers.
3. `downloads/SHA256SUMS.txt`.
4. changed website HTML, CSS, and JavaScript.
5. `updates/latest.json` last, using upload to a temporary filename followed by an atomic `mv` in the same directory.

Do not recursively overwrite `/var/www/cubexp.com` as a whole. Copy explicit directories/files and preserve the API/admin deployment.

## Verification

- Parse the live JSON and confirm `version`, `pub_date`, all three platform keys, non-empty signatures, and HTTPS URLs.
- `curl -fI` every download and updater URL; compare `Content-Length` where available.
- Download or hash the remote files and compare against staged `SHA256SUMS.txt`.
- For every feed checksum, derive the value from the exact staged/uploaded file with `sha256sum` or `shasum -a 256`; do not transcribe it manually. Assert the value matches `^[a-f0-9]{64}$` before writing JSON, then run the feed's client-side/schema validator against both the local file and the freshly fetched live file. A checksum with 65 or fewer than 64 characters is invalid even if the artifact itself is correct.
- Confirm the website download links use the same four canonical filenames.
- Confirm the English language switch renders the same released version.
- Run `nginx -t` after relevant web-server configuration changes; static release uploads alone should not require an Nginx reload.
- Keep previous version directories intact so reverting `latest.json` remains possible.
