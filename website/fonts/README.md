# CubeOffice optional desktop fonts

Run `node scripts/prepare-cubeoffice-fonts.mjs` from the repository root. It reads
upstream's pinned public font release, verifies the manifest and every asset,
mirrors fonts, licenses and corresponding sources into `releases/<version>/`,
and writes `profiles/cubeoffice/desktop/font-source.json` with the cubexp.com
manifest URL and its SHA-256. Generated binaries are ignored by Git.

Publish the complete generated version directory to
`/var/www/cubexp.com/fonts/releases/<version>/` before distributing desktop builds
that reference it. Never replace an existing version with different bytes. The
existing nginx static-file handler serves these files; native Rust downloads
need no webview CORS or CSP changes. Verify the public manifest and asset hashes
after upload. Retain old versions for existing desktop installations.

The distribution desktop launcher always sets `OFFICE_FONTS_CONFIG` to the
CubeOffice pin, including dev and all native build targets. System fonts win;
missing families use the optional upstream resolver and its licensed substitutes.
Downloads are checked against pinned hashes and cached in the app cache directory.
Unavailable downloads fall back to the existing system rendering behavior.

The upstream submodule includes the shared font resolver and download transport.
Its native URL validation additionally accepts versioned HTTPS static releases at
`/fonts/releases/<version>/<manifest>`; assets remain confined to that directory.

For a live native smoke test (downloads one face and then reads it offline):

```sh
OFFICE_FONTS_CONFIG="$PWD/profiles/cubeoffice/desktop/font-source.json" \
  cargo test --manifest-path als-office/apps/desktop/src-tauri/Cargo.toml \
  --lib font_downloads --locked -- --include-ignored
```

The downloader initializes its own TLS provider, so downloading a font does not
depend on the updater having run first.

## Admin font list

`/admin/#font-library` reads `/fonts/index.json`, verifies its pinned manifest,
and displays family, weight/style, format, size, license and download links.
Searching the list does not download font binaries. The list is part of the
existing authenticated dashboard; the font assets themselves remain public.

The preparation command also writes `website/fonts/index.json`. Publish that
pointer **after** the complete release directory. Deploy admin `fonts.js`,
`app.js`, `styles.css` and `index.html` together, updating their hash query strings.
For browser verification, run `node scripts/tests/admin-font-library.cjs` with
Playwright on `NODE_PATH`; `ADMIN_FONT_TEST_LOCAL=1` serves the local admin changes
against the live read-only API and font release before deployment.
