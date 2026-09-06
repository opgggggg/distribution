#!/usr/bin/env python3
"""Small CubeOffice API for feedback, diagnostics, and anonymous DAU."""

from __future__ import print_function

import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from http import cookies
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse

import psycopg2
from psycopg2.extras import DictCursor


HOST = os.environ.get("CUBEOFFICE_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("CUBEOFFICE_API_PORT", "8765"))
DB_DSN = os.environ.get("CUBEOFFICE_DATABASE_URL", "")
UPLOAD_DIR = os.environ.get("CUBEOFFICE_UPLOAD_DIR", "/var/lib/cubeoffice-api/uploads")
ADMIN_PASSWORD_HASH = os.environ.get("CUBEOFFICE_ADMIN_PASSWORD_HASH", "")
SESSION_TTL_SECONDS = 12 * 60 * 60
MAX_JSON_BYTES = 7 * 1024 * 1024
MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{20,80}$")
SAFE_TEXT_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
SCREENSHOT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS clients (
  client_id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  first_version TEXT,
  last_version TEXT,
  platform TEXT,
  arch TEXT,
  locale TEXT
);
CREATE TABLE IF NOT EXISTS daily_activity (
  day TEXT NOT NULL,
  client_id TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  checks INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, client_id)
);
CREATE TABLE IF NOT EXISTS update_checks (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version TEXT,
  platform TEXT,
  arch TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  contact TEXT,
  app_version TEXT,
  platform TEXT,
  arch TEXT,
  locale TEXT,
  system_info TEXT,
  screenshot_path TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  context TEXT,
  system_info TEXT,
  app_version TEXT,
  platform TEXT,
  arch TEXT
);
"""

INDEXES = {
    "update_checks_created_at": "CREATE INDEX update_checks_created_at ON update_checks(created_at)",
    "feedback_created_at": "CREATE INDEX feedback_created_at ON feedback(created_at DESC)",
    "feedback_status": "CREATE INDEX feedback_status ON feedback(status)",
    "logs_created_at": "CREATE INDEX logs_created_at ON logs(created_at DESC)",
    "logs_level": "CREATE INDEX logs_level ON logs(level)",
}

SESSIONS = {}
SESSIONS_LOCK = threading.Lock()
RATE_BUCKETS = defaultdict(deque)
RATE_LOCK = threading.Lock()


def utc_now():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def utc_day():
    return datetime.datetime.utcnow().date().isoformat()


def text(value, limit):
    if value is None:
        return ""
    normalized = SAFE_TEXT_RE.sub("", str(value)).strip()
    return normalized[:limit]


def json_text(value, limit=8192):
    if not isinstance(value, (dict, list)):
        return None
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return encoded[:limit]


def valid_client_id(value):
    candidate = text(value, 80)
    if not CLIENT_ID_RE.match(candidate):
        raise ApiError(400, "invalid_client_id", "A valid anonymous client ID is required.")
    return candidate


class Database:
    def __init__(self):
        self.connection = psycopg2.connect(DB_DSN, connect_timeout=5)

    def __enter__(self):
        return self

    def __exit__(self, error_type, _error, _traceback):
        try:
            if error_type is None:
                self.connection.commit()
            else:
                self.connection.rollback()
        finally:
            self.connection.close()

    def execute(self, statement, values=None):
        cursor = self.connection.cursor(cursor_factory=DictCursor)
        cursor.execute(statement.replace("?", "%s"), values or ())
        return cursor


def database():
    return Database()


def migrate():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with database() as connection:
        connection.execute(SCHEMA)
        existing = {
            row[0]
            for row in connection.execute(
                "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
            ).fetchall()
        }
        for name, statement in INDEXES.items():
            if name not in existing:
                connection.execute(statement)


def prune_old_data(connection):
    cutoff_logs = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).isoformat() + "Z"
    cutoff_checks = (datetime.datetime.utcnow() - datetime.timedelta(days=90)).isoformat() + "Z"
    connection.execute("DELETE FROM logs WHERE created_at < ?", (cutoff_logs,))
    connection.execute("DELETE FROM update_checks WHERE created_at < ?", (cutoff_checks,))


def platform_distribution(connection, day_30):
    """One installation per latest reported platform; activity uses distinct IDs."""
    rows = connection.execute(
        """SELECT c.platform, COUNT(*) AS clients,
                  COUNT(a.client_id) AS active_30d
           FROM clients c
           LEFT JOIN (SELECT DISTINCT client_id FROM daily_activity WHERE day >= ?) a
             ON a.client_id = c.client_id
           GROUP BY c.platform""", (day_30,)
    ).fetchall()
    counts = {key: {"platform": key, "clients": 0, "active_30d": 0}
              for key in ("macos", "windows", "linux", "android", "other", "unknown")}
    aliases = {"darwin": "macos", "mac": "macos", "macos": "macos", "osx": "macos", "macintel": "macos", "macppc": "macos",
               "macarm": "macos",
               "win32": "windows", "win64": "windows", "windows": "windows",
               "linux": "linux", "android": "android"}
    for row in rows:
        raw = (row["platform"] or "").strip().lower()
        key = aliases.get(raw, "other" if raw else "unknown")
        counts[key]["clients"] += row["clients"]
        counts[key]["active_30d"] += row["active_30d"]
    return [item for key, item in counts.items()
            if key not in ("other", "unknown") or item["clients"]]


def touch_client(connection, payload, now):
    client_id = valid_client_id(payload.get("client_id"))
    version = text(payload.get("app_version") or payload.get("version"), 40)
    platform = text(payload.get("platform"), 40)
    arch = text(payload.get("arch"), 40)
    locale = text(payload.get("locale"), 40)
    connection.execute("SELECT pg_advisory_xact_lock(hashtext(?))", (client_id,))
    connection.execute(
        """
        INSERT INTO clients (
          client_id, first_seen, last_seen, first_version, last_version, platform, arch, locale
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_id = ?)
        """,
        (client_id, now, now, version, version, platform, arch, locale, client_id),
    )
    connection.execute(
        """
        UPDATE clients SET last_seen = ?, last_version = ?, platform = ?, arch = ?, locale = ?
        WHERE client_id = ?
        """,
        (now, version, platform, arch, locale, client_id),
    )
    return client_id, version, platform, arch, locale


def verify_password(password):
    try:
        algorithm, iterations, salt_hex, expected_hex = ADMIN_PASSWORD_HASH.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        ).hex()
        return hmac.compare_digest(actual, expected_hex)
    except (TypeError, ValueError):
        return False


class ApiError(Exception):
    def __init__(self, status, code, message):
        super(ApiError, self).__init__(message)
        self.status = status
        self.code = code
        self.message = message


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "CubeOfficeAPI/1.0"

    def log_message(self, message, *args):
        print("%s %s" % (self.address_string(), message % args))

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super(Handler, self).end_headers()

    def do_OPTIONS(self):
        if self.path.startswith("/api/v1/") and "/admin/" not in self.path:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "86400")
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/health":
                return self.write_json(200, {"ok": True})
            if parsed.path == "/api/v1/admin/session":
                self.require_admin()
                return self.write_json(200, {"authenticated": True})
            if parsed.path == "/api/v1/admin/overview":
                self.require_admin()
                return self.admin_overview(parse_qs(parsed.query))
            if parsed.path == "/api/v1/admin/feedback":
                self.require_admin()
                return self.admin_feedback(parse_qs(parsed.query))
            if parsed.path == "/api/v1/admin/logs":
                self.require_admin()
                return self.admin_logs(parse_qs(parsed.query))
            screenshot_match = re.match(
                r"^/api/v1/admin/feedback/([A-Za-z0-9-]+)/screenshot$", parsed.path
            )
            if screenshot_match:
                self.require_admin()
                return self.admin_screenshot(screenshot_match.group(1))
            raise ApiError(404, "not_found", "Not found.")
        except ApiError as error:
            self.write_error(error)
        except Exception as error:
            print("GET error:", repr(error))
            self.write_error(ApiError(500, "server_error", "Server error."))

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/v1/admin/login":
                return self.admin_login()
            if parsed.path == "/api/v1/admin/logout":
                self.require_admin()
                return self.admin_logout()
            if parsed.path == "/api/v1/admin/feedback/status":
                self.require_admin()
                return self.admin_feedback_status()
            if parsed.path == "/api/v1/update-checks":
                self.rate_limit("update", 90, 60)
                return self.record_update_check()
            if parsed.path == "/api/v1/logs":
                self.rate_limit("logs", 30, 60)
                return self.record_log()
            if parsed.path == "/api/v1/feedback":
                self.rate_limit("feedback", 5, 60 * 60)
                return self.record_feedback()
            raise ApiError(404, "not_found", "Not found.")
        except ApiError as error:
            self.write_error(error)
        except Exception as error:
            print("POST error:", repr(error))
            self.write_error(ApiError(500, "server_error", "Server error."))

    def rate_limit(self, scope, limit, window_seconds):
        remote = self.client_address[0]
        if remote in ("127.0.0.1", "::1"):
            remote = text(self.headers.get("X-Real-IP"), 64) or remote
        # This value exists only in process memory for throttling; it is never persisted.
        key = (scope, remote)
        now = time.time()
        with RATE_LOCK:
            bucket = RATE_BUCKETS[key]
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                raise ApiError(429, "rate_limited", "Please wait before trying again.")
            bucket.append(now)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ApiError(400, "invalid_length", "Invalid request length.")
        if length <= 0 or length > MAX_JSON_BYTES:
            raise ApiError(413, "request_too_large", "Request body is too large.")
        if "application/json" not in self.headers.get("Content-Type", ""):
            raise ApiError(415, "json_required", "JSON is required.")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "invalid_json", "Invalid JSON.")
        if not isinstance(payload, dict):
            raise ApiError(400, "invalid_json", "A JSON object is required.")
        return payload

    def record_update_check(self):
        payload = self.read_json()
        now = utc_now()
        with database() as connection:
            client_id, version, platform, arch, _locale = touch_client(connection, payload, now)
            connection.execute(
                "INSERT INTO update_checks (client_id, created_at, version, platform, arch) VALUES (?, ?, ?, ?, ?)",
                (client_id, now, version, platform, arch),
            )
            day = utc_day()
            connection.execute(
                """
                INSERT INTO daily_activity (day, client_id, first_seen, last_seen, checks)
                SELECT ?, ?, ?, ?, 0
                WHERE NOT EXISTS (
                  SELECT 1 FROM daily_activity WHERE day = ? AND client_id = ?
                )
                """,
                (day, client_id, now, now, day, client_id),
            )
            connection.execute(
                "UPDATE daily_activity SET last_seen = ?, checks = checks + 1 WHERE day = ? AND client_id = ?",
                (now, day, client_id),
            )
            prune_old_data(connection)
        self.write_json(202, {"ok": True, "recorded_at": now}, public=True)

    def record_log(self):
        payload = self.read_json()
        now = utc_now()
        message = text(payload.get("message"), 12000)
        if not message:
            raise ApiError(400, "message_required", "A log message is required.")
        level = text(payload.get("level"), 16).lower()
        if level not in ("error", "warning", "info"):
            level = "error"
        with database() as connection:
            client_id, version, platform, arch, _locale = touch_client(connection, payload, now)
            cursor = connection.execute(
                """
                INSERT INTO logs (
                  client_id, created_at, level, message, stack, context, system_info,
                  app_version, platform, arch
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """,
                (
                    client_id,
                    now,
                    level,
                    message,
                    text(payload.get("stack"), 20000) or None,
                    json_text(payload.get("context"), 8192),
                    json_text(payload.get("system_info"), 8192),
                    version,
                    platform,
                    arch,
                ),
            )
            prune_old_data(connection)
            log_id = cursor.fetchone()[0]
        self.write_json(202, {"ok": True, "id": log_id}, public=True)

    def record_feedback(self):
        payload = self.read_json()
        valid_client_id(payload.get("client_id"))
        message = text(payload.get("message"), 8000)
        if len(message) < 10:
            raise ApiError(400, "message_too_short", "Please provide at least 10 characters.")
        category = text(payload.get("category"), 24).lower()
        if category not in ("bug", "suggestion", "question", "other"):
            category = "other"
        now = utc_now()
        feedback_id = "FB-%s-%s" % (
            datetime.datetime.utcnow().strftime("%Y%m%d"),
            secrets.token_hex(4).upper(),
        )
        screenshot_path = self.save_screenshot(feedback_id, payload.get("screenshot"))
        try:
            with database() as connection:
                client_id, version, platform, arch, locale = touch_client(
                    connection, payload, now
                )
                connection.execute(
                    """
                    INSERT INTO feedback (
                      id, client_id, created_at, category, message, contact, app_version,
                      platform, arch, locale, system_info, screenshot_path, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
                    """,
                    (
                        feedback_id,
                        client_id,
                        now,
                        category,
                        message,
                        text(payload.get("contact"), 200) or None,
                        version,
                        platform,
                        arch,
                        locale,
                        json_text(payload.get("system_info"), 8192),
                        screenshot_path,
                    ),
                )
        except Exception:
            if screenshot_path:
                try:
                    os.remove(os.path.join(UPLOAD_DIR, screenshot_path))
                except OSError:
                    pass
            raise
        self.write_json(201, {"ok": True, "feedback_id": feedback_id}, public=True)

    def save_screenshot(self, feedback_id, screenshot):
        if screenshot is None:
            return None
        if not isinstance(screenshot, dict):
            raise ApiError(400, "invalid_screenshot", "Invalid screenshot.")
        mime = text(screenshot.get("type"), 64).lower()
        extension = SCREENSHOT_TYPES.get(mime)
        if not extension:
            raise ApiError(400, "invalid_screenshot_type", "PNG, JPEG, or WebP is required.")
        encoded = screenshot.get("data")
        if not isinstance(encoded, str):
            raise ApiError(400, "invalid_screenshot", "Invalid screenshot.")
        if encoded.startswith("data:"):
            encoded = encoded.split(",", 1)[-1]
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError):
            raise ApiError(400, "invalid_screenshot", "Invalid screenshot data.")
        if not decoded or len(decoded) > MAX_SCREENSHOT_BYTES:
            raise ApiError(413, "screenshot_too_large", "Screenshot must be 5 MB or smaller.")
        valid_magic = (
            (mime == "image/png" and decoded.startswith(b"\x89PNG\r\n\x1a\n"))
            or (mime == "image/jpeg" and decoded.startswith(b"\xff\xd8\xff"))
            or (
                mime == "image/webp"
                and decoded.startswith(b"RIFF")
                and decoded[8:12] == b"WEBP"
            )
        )
        if not valid_magic:
            raise ApiError(
                400, "invalid_screenshot_data", "Screenshot data does not match its type."
            )
        filename = feedback_id + extension
        path = os.path.join(UPLOAD_DIR, filename)
        with open(path, "wb") as output:
            output.write(decoded)
        os.chmod(path, 0o600)
        return filename

    def admin_login(self):
        self.rate_limit("admin-login", 10, 15 * 60)
        payload = self.read_json()
        if not verify_password(text(payload.get("password"), 512)):
            raise ApiError(401, "invalid_credentials", "Invalid credentials.")
        token = secrets.token_urlsafe(32)
        with SESSIONS_LOCK:
            SESSIONS[token] = time.time() + SESSION_TTL_SECONDS
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header(
            "Set-Cookie",
            "cubeoffice_admin=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Strict"
            % (token, SESSION_TTL_SECONDS),
        )
        self.end_headers()
        self.wfile.write(b'{"authenticated":true}')

    def admin_logout(self):
        token = self.session_token()
        with SESSIONS_LOCK:
            SESSIONS.pop(token, None)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header(
            "Set-Cookie", "cubeoffice_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
        )
        self.end_headers()
        self.wfile.write(b'{"authenticated":false}')

    def session_token(self):
        parsed = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        morsel = parsed.get("cubeoffice_admin")
        return morsel.value if morsel else ""

    def require_admin(self):
        token = self.session_token()
        now = time.time()
        with SESSIONS_LOCK:
            expires = SESSIONS.get(token, 0)
            if expires <= now:
                SESSIONS.pop(token, None)
                raise ApiError(401, "authentication_required", "Authentication required.")
            SESSIONS[token] = now + SESSION_TTL_SECONDS

    def admin_overview(self, _query):
        today = datetime.datetime.utcnow().date()
        day_7 = (today - datetime.timedelta(days=6)).isoformat()
        day_30 = (today - datetime.timedelta(days=29)).isoformat()
        with database() as connection:
            totals = {
                "dau_today": connection.execute(
                    "SELECT COUNT(*) FROM daily_activity WHERE day = ?", (today.isoformat(),)
                ).fetchone()[0],
                "active_7d": connection.execute(
                    "SELECT COUNT(DISTINCT client_id) FROM daily_activity WHERE day >= ?", (day_7,)
                ).fetchone()[0],
                "active_30d": connection.execute(
                    "SELECT COUNT(DISTINCT client_id) FROM daily_activity WHERE day >= ?", (day_30,)
                ).fetchone()[0],
                "clients": connection.execute("SELECT COUNT(*) FROM clients").fetchone()[0],
                "feedback_new": connection.execute(
                    "SELECT COUNT(*) FROM feedback WHERE status = 'new'"
                ).fetchone()[0],
                "errors_24h": connection.execute(
                    "SELECT COUNT(*) FROM logs WHERE created_at >= ? AND level = 'error'",
                    ((datetime.datetime.utcnow() - datetime.timedelta(days=1)).isoformat() + "Z",),
                ).fetchone()[0],
            }
            rows = connection.execute(
                "SELECT day, COUNT(*) AS active FROM daily_activity WHERE day >= ? GROUP BY day ORDER BY day",
                (day_30,),
            ).fetchall()
            platforms = platform_distribution(connection, day_30)
            versions = connection.execute(
                "SELECT last_version AS version, COUNT(*) AS clients FROM clients GROUP BY last_version ORDER BY clients DESC LIMIT 8"
            ).fetchall()
        self.write_json(
            200,
            {
                "totals": totals,
                "daily": [dict(row) for row in rows],
                "versions": [dict(row) for row in versions],
                "platforms": platforms,
            },
        )

    def admin_feedback(self, query):
        status = text((query.get("status") or [""])[0], 24)
        limit = self.query_limit(query, 200)
        sql = "SELECT * FROM feedback"
        values = []
        if status in ("new", "reviewing", "resolved"):
            sql += " WHERE status = ?"
            values.append(status)
        sql += " ORDER BY created_at DESC LIMIT ?"
        values.append(limit)
        with database() as connection:
            rows = connection.execute(sql, values).fetchall()
        self.write_json(200, {"items": [self.public_row(row) for row in rows]})

    def admin_feedback_status(self):
        payload = self.read_json()
        feedback_id = text(payload.get("id"), 40)
        status = text(payload.get("status"), 24)
        if status not in ("new", "reviewing", "resolved"):
            raise ApiError(400, "invalid_status", "Invalid status.")
        with database() as connection:
            changed = connection.execute(
                "UPDATE feedback SET status = ? WHERE id = ?", (status, feedback_id)
            ).rowcount
        if not changed:
            raise ApiError(404, "not_found", "Feedback was not found.")
        self.write_json(200, {"ok": True})

    def admin_screenshot(self, feedback_id):
        with database() as connection:
            row = connection.execute(
                "SELECT screenshot_path FROM feedback WHERE id = ?", (feedback_id,)
            ).fetchone()
        if not row or not row["screenshot_path"]:
            raise ApiError(404, "not_found", "Screenshot was not found.")
        filename = os.path.basename(row["screenshot_path"])
        path = os.path.join(UPLOAD_DIR, filename)
        if not os.path.isfile(path):
            raise ApiError(404, "not_found", "Screenshot was not found.")
        mime = "image/png"
        if filename.endswith(".jpg"):
            mime = "image/jpeg"
        elif filename.endswith(".webp"):
            mime = "image/webp"
        with open(path, "rb") as source:
            body = source.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def admin_logs(self, query):
        level = text((query.get("level") or [""])[0], 16)
        limit = self.query_limit(query, 300)
        sql = "SELECT * FROM logs"
        values = []
        if level in ("error", "warning", "info"):
            sql += " WHERE level = ?"
            values.append(level)
        sql += " ORDER BY created_at DESC LIMIT ?"
        values.append(limit)
        with database() as connection:
            rows = connection.execute(sql, values).fetchall()
        self.write_json(200, {"items": [self.public_row(row) for row in rows]})

    def query_limit(self, query, maximum):
        try:
            return min(maximum, max(1, int((query.get("limit") or ["100"])[0])))
        except (TypeError, ValueError):
            raise ApiError(400, "invalid_limit", "Invalid result limit.")

    def public_row(self, row):
        result = dict(row)
        for key in ("system_info", "context"):
            if result.get(key):
                try:
                    result[key] = json.loads(result[key])
                except ValueError:
                    pass
        return result

    def write_error(self, error):
        self.write_json(
            error.status,
            {"error": {"code": error.code, "message": error.message}},
            public="/admin/" not in self.path,
        )

    def write_json(self, status, payload, public=False):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if public:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    if not ADMIN_PASSWORD_HASH:
        raise SystemExit("CUBEOFFICE_ADMIN_PASSWORD_HASH is required")
    if not DB_DSN:
        raise SystemExit("CUBEOFFICE_DATABASE_URL is required")
    migrate()
    server = ThreadedHTTPServer((HOST, PORT), Handler)
    print("CubeOffice API listening on http://%s:%d" % (HOST, PORT))
    server.serve_forever()
