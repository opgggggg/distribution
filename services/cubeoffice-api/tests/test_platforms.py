import ast
from pathlib import Path
import sqlite3
import unittest

source = Path(__file__).parents[1] / 'server.py'
tree = ast.parse(source.read_text())
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'platform_distribution')
namespace = {}
exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)

class PlatformDistributionTest(unittest.TestCase):
    def test_aliases_distinct_activity_and_unknowns(self):
        db = sqlite3.connect(':memory:'); db.row_factory = sqlite3.Row
        db.executescript('CREATE TABLE clients(client_id TEXT PRIMARY KEY, platform TEXT); CREATE TABLE daily_activity(client_id TEXT, day TEXT);')
        db.executemany('INSERT INTO clients VALUES (?, ?)', [('a','darwin'),('b','MacIntel'),('c','win32'),('d','android'),('e','linux'),('f',None),('g','ios')])
        db.executemany('INSERT INTO daily_activity VALUES (?, ?)', [('a','2026-09-01'),('a','2026-09-02'),('d','2026-09-06'),('c','2026-01-01')])
        rows = {r['platform']:r for r in namespace['platform_distribution'](db, '2026-08-08')}
        self.assertEqual(rows['macos']['clients'], 2)
        self.assertEqual(rows['macos']['active_30d'], 1)
        self.assertEqual(rows['android']['active_30d'], 1)
        self.assertEqual(rows['windows']['active_30d'], 0)
        self.assertEqual(rows['unknown']['clients'], 1)
        self.assertEqual(rows['other']['clients'], 1)
        self.assertEqual(sum(r['clients'] for r in rows.values()), 7)
        self.assertEqual(sum(r['active_30d'] for r in rows.values()), 2)
        db.execute('DELETE FROM clients')
        empty = namespace['platform_distribution'](db, '2026-08-08')
        self.assertEqual(len(empty), 4)
        self.assertEqual(sum(r['clients'] for r in empty), 0)

if __name__ == '__main__': unittest.main()
