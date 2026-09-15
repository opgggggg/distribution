import ast
from pathlib import Path
import sqlite3
import unittest

source = Path(__file__).parents[1] / 'server.py'
tree = ast.parse(source.read_text())
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'system_version_distribution')
namespace = {}
exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)

class SystemVersionDistributionTest(unittest.TestCase):
    def distribution(self, clients, activity=(), **kwargs):
        db = sqlite3.connect(':memory:'); db.row_factory = sqlite3.Row
        db.executescript('CREATE TABLE clients(client_id TEXT PRIMARY KEY, os_version TEXT); CREATE TABLE daily_activity(client_id TEXT, day TEXT);')
        db.executemany('INSERT INTO clients VALUES (?, ?)', clients)
        db.executemany('INSERT INTO daily_activity VALUES (?, ?)', activity)
        return namespace['system_version_distribution'](db, '2026-08-08', **kwargs)

    def test_folds_minor_versions_and_ranks_by_installations(self):
        rows = self.distribution(
            [('a', 'iOS 18.2'), ('b', 'iOS 18.0'), ('c', 'iOS 17.6'),
             ('d', 'Android 15'), ('e', 'HarmonyOS 5.0.0'), ('f', 'HarmonyOS 5.1.0')],
            [('a', '2026-09-01'), ('b', '2026-09-02'), ('c', '2026-01-01')],
        )
        self.assertEqual([item['system'] for item in rows], ['HarmonyOS 5', 'iOS 18', 'Android 15', 'iOS 17'])
        self.assertEqual(rows[1], {'system': 'iOS 18', 'clients': 2, 'active_30d': 2})
        # Activity outside the window counts as an installation but not as active.
        self.assertEqual(rows[3], {'system': 'iOS 17', 'clients': 1, 'active_30d': 0})

    def test_skips_unreported_versions_and_caps_the_list(self):
        self.assertEqual(self.distribution([('a', None), ('b', ''), ('c', '   ')]), [])
        rows = self.distribution([(str(index), f'Android {index}') for index in range(20)], limit=3)
        self.assertEqual(len(rows), 3)
        # Nothing to split on stays whole rather than being dropped.
        self.assertEqual(self.distribution([('a', 'Linux')])[0]['system'], 'Linux')

if __name__ == '__main__': unittest.main()
