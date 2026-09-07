# CubeOffice website deployment overlay

These files extend the existing cubexp.com site with Android downloads, privacy disclosures, and admin controls.
They depend on the existing production app.js, assets, and other pages; this is
not a complete standalone site. Deploy the changed public HTML/CSS/JavaScript, admin assets, and Android update feed.

Android 1.2.1 was published on 2026-09-07. The APK lives at
/downloads/CubeOffice-1.2.1-Android-b1002003.apk and its checksum is appended to
/downloads/SHA256SUMS.txt. Existing desktop downloads and updater feeds are unchanged.
The original web files and checksum list are backed up on the server under
.release-staging/android-1.2.0-20260906/backup/.

When styles.css changes, update its version query in index.html to the first
12 characters of the CSS SHA256 and publish both files. Production CSS has
a one-week immutable cache; replacing CSS without changing its URL leaves
existing visitors on the previous layout.

Android build 1002003 includes client services and adaptive form controls with display version 1.2.1.
The download link now targets CubeOffice-1.2.0-Android-b1002002.apk; the previous
APK remains available. Publish updates/android/latest.json only after verifying
the APK's hash and signature. This feed is independent of desktop latest.json.

The admin/ directory contains the full admin UI. Platform distribution shows count
and share for cumulative or 30-day active installations. Update hashed asset queries
in admin/index.html whenever admin/app.js or admin/styles.css changes.

The privacy policy includes Android file access, local drafts, client IDs, update checks, and feedback. Rebuild the shared admin controls with `npx vite build --config website/admin/vite.controls.config.mjs`. Refresh the hashed asset queries when publishing controls.js, controls.css, app.js, styles.css, or i18n.js.
