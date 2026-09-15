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
        db.executemany('INSERT INTO clients VALUES (?, ?)', [('a','darwin'),('b','MacIntel'),('c','win32'),('d','android'),('e','linux'),('f',None),('g','symbian')])
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
        self.assertEqual(len(empty), 10)
        self.assertEqual(sum(r['clients'] for r in empty), 0)

    def test_device_types(self):
        db = sqlite3.connect(':memory:'); db.row_factory = sqlite3.Row
        db.executescript('CREATE TABLE clients(client_id TEXT PRIMARY KEY, platform TEXT); CREATE TABLE daily_activity(client_id TEXT, day TEXT);')
        db.executemany('INSERT INTO clients VALUES (?, ?)', [
            ('a','harmonyos-phone'),('b','HarmonyOS-Phone'),('c','harmonyos-tablet'),
            ('d','harmonyos-2in1'),('e','harmonyos'),('f','harmonyos-car'),
            ('g','ios-iphone'),('h','ios-ipad'),('i','ios-vision'),
            ('j','android-phone'),('k','android-tablet'),('l','android-pc'),('m','android')])
        db.executemany('INSERT INTO daily_activity VALUES (?, ?)', [('a','2026-09-01'),('c','2026-09-02'),('d','2026-09-03'),('g','2026-09-04'),('e','2026-01-01')])
        rows = {r['platform']:r for r in namespace['platform_distribution'](db, '2026-08-08')}
        self.assertEqual(rows['harmonyos_phone']['clients'], 2)
        self.assertEqual(rows['harmonyos_phone']['active_30d'], 1)
        self.assertEqual(rows['harmonyos_tablet']['clients'], 1)
        self.assertEqual(rows['harmonyos_pc']['clients'], 1)
        self.assertEqual(rows['harmonyos_pc']['active_30d'], 1)
        self.assertEqual(rows['ios_iphone']['clients'], 1)
        self.assertEqual(rows['ios_iphone']['active_30d'], 1)
        self.assertEqual(rows['ios_ipad']['clients'], 1)
        self.assertEqual(rows['android_phone']['clients'], 1)
        self.assertEqual(rows['android_tablet']['clients'], 1)
        self.assertEqual(rows['android_pc']['clients'], 1)
        # The bare system name collects installations that report no device type and
        # device types that are not charted; none of them may fall into other/unknown.
        self.assertEqual(rows['harmonyos']['clients'], 2)
        self.assertEqual(rows['harmonyos']['active_30d'], 0)
        self.assertEqual(rows['ios']['clients'], 1)
        self.assertEqual(rows['android']['clients'], 1)
        self.assertNotIn('other', rows)
        self.assertNotIn('unknown', rows)
        self.assertEqual(sum(r['clients'] for r in rows.values()), 13)
        self.assertEqual(sum(r['active_30d'] for r in rows.values()), 4)

if __name__ == '__main__': unittest.main()
