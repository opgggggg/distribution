# CubeOffice API

Local operational credentials: `~/cubexp.com/ssh/cubexp.pem` and
`~/cubexp.com/admin/password`. The running server retains its password hash in
`/etc/cubeoffice-api.env`; do not replace it with a plaintext password.

Source synchronized from the running production service before adding platform distribution.
Runtime: Python 3, psycopg2, PostgreSQL; credentials remain in the server environment.

GET /api/v1/admin/overview (authenticated) now includes platforms: platform, clients,
active_30d. Installations are counted once by their latest reported platform; recent
activity joins distinct IDs in daily_activity. macOS aliases include MacIntel/darwin,
Windows includes win32/win64. Mobile clients report their device type after the system
name, so `android-phone`/`android-tablet`/`android-pc`, `ios-iphone`/`ios-ipad` and
`harmonyos-phone`/`harmonyos-tablet`/`harmonyos-2in1` become separate rows
(`android_pc` maps to desktop-mode Android, `harmonyos_pc` to 2in1). Any other device
type, and the bare `android`/`ios`/`harmonyos` that earlier builds report, falls into
that system's undistinguished row. The charted device types remain visible at zero;
other/unknown, `android_pc` and the three undistinguished rows appear only when
populated. No schema migration is needed for this: the device type rides in the existing
free-text `platform` column and is normalised on read.

The overview also includes `systems`: `system, clients, active_30d` per system version,
ranked by installations and capped at twelve. Clients report a display string
(`Android 15`, `iOS 18.2`, `HarmonyOS 5.0.0`, `Mac OS 15.3.1`) in a new free-text
`os_version` column on `clients`; the collector folds it to the major version, so
`iOS 18.2` and `iOS 18.0` share one row. Startup adds the column to existing databases
(additive, NULL for installations recorded before it) through the same mechanism that
adds the feedback columns. A client that reports no system version never clears one
already recorded. Desktop builds only reach the API through feedback and error logs, so
their rows appear once a user submits either.

Validation: python3 services/cubeoffice-api/tests/test_platforms.py and
python3 services/cubeoffice-api/tests/test_system_versions.py. Production
read-only overview checks confirmed both platform totals match dashboard totals.
Service health and unauthenticated 401 behavior verified after deployment.
Backup: /var/www/cubexp.com/.release-staging/platform-distribution/backup/.

## Feedback status and replies

The authenticated admin feedback view shows Chinese status labels, a saved reply,
the last handling timestamp, and the anonymous `client_id`. Replies are admin-only
records: saving does not send email or notify the client.

`POST /api/v1/admin/feedback/status` accepts `id`, `status` (`new`, `reviewing`,
`resolved`), `reply` (at most 12,000 characters), and the last-read `revision`.
It returns the updated `item`; concurrent stale edits return 409. Legacy status-only
requests preserve the reply. Startup adds `reply`, `updated_at`, and `revision`
columns to existing feedback tables without changing existing feedback/client IDs.
`fixed_version` is optional text (up to 100 characters), saved with the same revision
guard and shown in the list and detail editor. Omitting it preserves the existing
value; submitting an empty string clears it. Startup adds this column with an empty default.

Targeted checks: `python3 services/cubeoffice-api/tests/test_feedback.py`.
Deployment backup: `/var/backups/cubeoffice-feedback-20260909/` (private).
Rollback restores the backed-up server/admin assets and restarts `cubeoffice-api`;
the additive database columns can remain in place, preserving saved replies.
