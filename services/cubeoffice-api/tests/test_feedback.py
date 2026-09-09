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
spec = importlib.util.spec_from_file_location('feedback_server', Path(__file__).parents[1] / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class FeedbackTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('CREATE TABLE feedback(id TEXT PRIMARY KEY, status TEXT, reply TEXT, updated_at TEXT, revision INTEGER, client_id TEXT, fixed_version TEXT)')
        self.db.execute("INSERT INTO feedback VALUES ('FB-test', 'new', '', NULL, 0, 'client-12345678901234567890', '')")
        db = self.db
        class Connection:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, values=()): return db.execute(sql.replace(' FOR UPDATE', ''), values)
        server.database = Connection
        self.handler = server.Handler.__new__(server.Handler)
        self.handler.write_json = lambda status, payload: setattr(self, 'result', payload)

    def save(self, **payload):
        self.handler.read_json = lambda: dict(id='FB-test', status='reviewing', **payload)
        self.handler.admin_feedback_status()

    def test_reply_status_and_client_id(self):
        self.save(reply='已确认，正在修复。', revision=0)
        row = self.result['item']
        self.assertEqual(row['reply'], '已确认，正在修复。')
        self.assertEqual(row['status'], 'reviewing')
        self.assertEqual(row['revision'], 1)
        self.assertTrue(row['updated_at'])
        self.assertEqual(row['client_id'], 'client-12345678901234567890')
        self.save()  # Legacy status-only clients must preserve the reply.
        self.assertEqual(self.result['item']['reply'], row['reply'])

    def test_stale_edits_and_invalid_replies(self):
        self.save(reply='first', revision=0)
        for payload in [dict(reply='stale', revision=0), dict(reply='x' * 12001, revision=1), dict(reply=123, revision=1), dict(reply='missing revision')]:
            with self.assertRaises(server.ApiError): self.save(**payload)
        self.assertEqual(self.db.execute('SELECT reply FROM feedback').fetchone()[0], 'first')

    def test_client_id_required(self):
        for value in [None, '', 'short']:
            with self.assertRaises(server.ApiError): server.valid_client_id(value)
        self.assertEqual(server.valid_client_id('client-12345678901234567890'), 'client-12345678901234567890')

    def test_fixed_version_saved_preserved_and_cleared(self):
        self.save(fixed_version=' als-office 0.57.4 ', revision=0)
        self.assertEqual(self.result['item']['fixed_version'], 'als-office 0.57.4')
        self.save(reply='fixed', revision=1)
        self.assertEqual(self.result['item']['fixed_version'], 'als-office 0.57.4')
        for payload in [dict(fixed_version='x' * 101, revision=2), dict(fixed_version=1, revision=2), dict(fixed_version='1.0'), dict(fixed_version='stale', revision=0)]:
            with self.assertRaises(server.ApiError): self.save(**payload)
        self.save(fixed_version='', revision=2)
        self.assertEqual(self.result['item']['fixed_version'], '')


if __name__ == '__main__': unittest.main()
