import importlib.util
import sqlite3
import sys
import types
import unittest
from pathlib import Path

sys.modules.setdefault('psycopg2', types.ModuleType('psycopg2'))
extras = types.ModuleType('psycopg2.extras')
extras.DictCursor = object
sys.modules.setdefault('psycopg2.extras', extras)
spec = importlib.util.spec_from_file_location('activity_server', Path(__file__).parents[1] / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class ActivityTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript(server.SCHEMA)
        self.db.execute('INSERT INTO telemetry_settings VALUES (?, ?)', ('usage_started', '2026-10-04'))
        self.db.create_function('hashtext', 1, lambda value: 0)
        self.db.create_function('pg_advisory_xact_lock', 1, lambda value: 0)
        db = self.db
        class Connection:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, values=()): return db.execute(sql, values)
        server.database = Connection
        server.prune_old_data = lambda connection: None
        server.utc_now = lambda: '2026-10-04T12:00:00Z'
        server.utc_day = lambda: '2026-10-04'
        self.handler = server.Handler.__new__(server.Handler)
        self.handler.write_json = lambda status, payload, **kw: setattr(self, 'result', payload)
        self.payload = {'client_id': 'client-12345678901234567890', 'version': '1.6.1', 'platform': 'harmonyos-phone'}
        self.handler.read_json = lambda: self.payload

    def test_deduplication_midnight_and_separate_update_history(self):
        self.handler.record_update_check()
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM usage_activity').fetchone()[0], 0)
        self.handler.record_activity()
        server.utc_now = lambda: '2026-10-04T23:59:59Z'
        self.handler.record_activity()
        row = dict(self.db.execute('SELECT * FROM usage_activity').fetchone())
        self.assertEqual(row['first_seen'], '2026-10-04T12:00:00Z')
        self.assertEqual(row['last_seen'], '2026-10-04T23:59:59Z')
        self.assertEqual(self.result['recorded_day'], '2026-10-04')
        server.utc_now = lambda: '2026-10-05T00:00:01Z'
        self.handler.record_activity()
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM usage_activity').fetchone()[0], 2)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM daily_activity').fetchone()[0], 1)
        self.assertEqual(sum(r['active_30d'] for r in server.platform_distribution(server.database(), '2026-10-01')), 1)

    def test_invalid_identity_does_not_create_activity(self):
        self.payload['client_id'] = 'short'
        with self.assertRaises(server.ApiError): self.handler.record_activity()
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM usage_activity').fetchone()[0], 0)

    def test_overview_does_not_mix_legacy_and_foreground_events(self):
        today = server.datetime.datetime.utcnow().date().isoformat()
        server.utc_now = lambda: today + 'T12:00:00Z'
        server.utc_day = lambda: today
        self.handler.record_update_check()
        self.handler.admin_overview({})
        self.assertEqual(self.result['totals']['dau_today'], 0)
        self.assertEqual(self.result['daily'], [])
        self.assertEqual(self.result['update_daily'][0]['active'], 1)
        self.handler.record_activity()
        self.handler.admin_overview({})
        self.assertEqual(self.result['totals']['dau_today'], 1)
        self.assertEqual(self.result['totals']['active_30d'], 1)
        self.assertEqual(self.result['daily'][0]['active'], 1)

if __name__ == '__main__': unittest.main()
