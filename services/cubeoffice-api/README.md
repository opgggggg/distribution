# CubeOffice service

Python 3 and PostgreSQL service for anonymous daily-active counts, optional error reports,
feedback attachments, and the `/admin/` dashboard API. Nginx terminates TLS and proxies
`/api/` to this process on `127.0.0.1:8765`.

Required environment:

```text
CUBEOFFICE_ADMIN_PASSWORD_HASH=pbkdf2_sha256$210000$<salt-hex>$<digest-hex>
CUBEOFFICE_DATABASE_URL=postgresql://cubeoffice_api:<password>@127.0.0.1/cubeoffice
```

Optional environment variables are `CUBEOFFICE_API_HOST`, `CUBEOFFICE_API_PORT`, and
`CUBEOFFICE_UPLOAD_DIR`. The database user only needs access to the `cubeoffice` database;
it does not require PostgreSQL superuser or operating-system privileges.

The service stores no raw IP address. Diagnostic logs are pruned after 30 days and raw
update-check events after 90 days. Daily aggregates and user-submitted feedback remain
until an administrator removes them.

## Client flow

1. On first launch, the app creates a random installation ID locally. It is not derived
   from hardware, an account, or a document.
2. The first-run settings screen explains automatic update checks and diagnostic reports;
   both start enabled and remain user-controllable.
3. An update check posts the installation ID and coarse app/platform fields. The server
   upserts the client and one `(UTC day, client)` aggregate before the signed updater runs.
4. Unhandled errors are path-redacted in the client and sent only while diagnostics are
   enabled. Feedback is always user-initiated and can optionally include contact details,
   system information, and one PNG/JPEG/WebP screenshot up to 5 MB.

## Public API

All public endpoints accept JSON. `client_id` is required and must be a 20–80 character
random identifier using letters, digits, `_`, or `-`.

- `POST /api/v1/update-checks` — accepts `client_id`, `version`, `platform`, `arch`, and
  `locale`; returns `202`.
- `POST /api/v1/logs` — accepts the common client fields plus `level`, `message`, optional
  `stack`, `context`, and `system_info`; returns `202` and the log ID.
- `POST /api/v1/feedback` — accepts the common client fields plus `category`, `message`,
  optional `contact`, `system_info`, and a base64 screenshot object; returns `201` and a
  feedback reference.

The admin API uses a 12-hour, `Secure`, `HttpOnly`, `SameSite=Strict` session cookie. Its
overview, feedback, logs, screenshot, and feedback-status routes are consumed only by the
same-origin `/admin/` application.

## PostgreSQL storage

- `clients` keeps first/last-seen version and coarse platform fields.
- `daily_activity` is the UTC-day/client deduplication table used for DAU.
- `update_checks` retains raw check events for 90 days.
- `logs` retains optional diagnostic reports for 30 days.
- `feedback` retains user-submitted reports and workflow status.
- Screenshot bytes are stored outside the web root in `CUBEOFFICE_UPLOAD_DIR`; PostgreSQL
  stores only the generated filename.

The service executes idempotent table/index migrations on startup. Install the PostgreSQL
driver from the operating system (for example `python3-psycopg2`) before starting it.
