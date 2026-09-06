# CubeOffice API

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
