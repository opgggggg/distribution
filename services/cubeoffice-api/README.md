# CubeOffice API

Local operational credentials: `~/cubexp.com/ssh/cubexp.pem` and
`~/cubexp.com/admin/password`. The running server retains its password hash in
`/etc/cubeoffice-api.env`; do not replace it with a plaintext password.

Source synchronized from the running production service before adding platform distribution.
Runtime: Python 3, psycopg2, PostgreSQL; credentials remain in the server environment.

GET /api/v1/admin/overview (authenticated) now includes platforms: platform, clients,
active_30d. Installations are counted once by their latest reported platform; recent
activity joins distinct IDs in daily_activity. macOS aliases include MacIntel/darwin,
Windows includes win32/win64. Known platforms remain visible at zero; other/unknown
rows appear only when populated. No schema migration is needed.

Validation: python3 services/cubeoffice-api/tests/test_platforms.py. Production
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
