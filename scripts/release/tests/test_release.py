import base64
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HELPERS = Path(__file__).resolve().parents[1]
REPO = HELPERS.parents[1]
sys.path.insert(0, str(HELPERS))
import release
import server


class ServerTransactions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.s = {'version': '9.1.0', 'androidVersionCode': 9001000, 'distribution': 'a' * 40}
        self.artifacts = release.canonical(self.s)
        self.metadata = ['downloads/SHA256SUMS.txt'] + release.PAGES + release.FEEDS
        self.content = {name: ('new ' + name).encode() for name in self.artifacts + self.metadata}
        self.content['release.json'] = json.dumps(self.s).encode()
        self.content['updates/latest.json'] = json.dumps({'version': '9.1.0'}).encode()
        self.content['updates/android/latest.json'] = json.dumps({'versionCode': 9001000}).encode()
        self.original = {}
        for name in self.metadata:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            data = b'old website'
            if name == 'updates/latest.json':
                data = b'{"version":"9.0.0"}'
            elif name == 'updates/android/latest.json':
                data = b'{"versionCode":9000000}'
            p.write_bytes(data)
            self.original[name] = data
        self.request = {'root': str(self.root), 'run': 'auto-9.1.0-' + 'a' * 12,
                        'release': self.s, 'artifacts': self.artifacts, 'metadata': self.metadata,
                        'inventory': {n: {'sha256': hashlib.sha256(b).hexdigest(), 'size': len(b)} for n, b in self.content.items()}}
        self.stage = self.root / '.release-staging' / self.request['run']

    def call(self, action):
        with contextlib.redirect_stdout(io.StringIO()):
            server.main({**self.request, 'action': action})

    def upload(self):
        self.call('init')
        for n, b in self.content.items():
            p = self.stage / n
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b)
            p.chmod(0o600)  # private local umask must not produce unreadable public downloads

    def test_upload_verify_activate_retry_and_backup(self):
        self.upload()
        self.call('artifacts')
        self.assertEqual((self.root / 'updates/latest.json').read_bytes(), self.original['updates/latest.json'])
        self.assertEqual((self.root / self.artifacts[0]).stat().st_mode & 0o777, 0o644)
        self.call('activate')
        self.call('verify')
        # Same-owned run can resume without changing immutable bytes or backups.
        self.call('init'); self.call('artifacts'); self.call('activate')
        for n, b in self.original.items():
            self.assertEqual((self.stage / 'backup' / n).read_bytes(), b)

    def test_resume_upload_cannot_truncate_public_hardlink(self):
        self.upload(); self.call('artifacts')
        name = self.artifacts[0]
        public = self.root / name
        original_inode = public.stat().st_ino
        with contextlib.redirect_stdout(io.StringIO()) as result:
            server.main({**self.request, 'action': 'missing'})
        self.assertEqual(json.loads(result.getvalue()), [])
        incoming = self.stage / (name + '.upload')
        incoming.write_bytes(b'partial')
        self.request['uploads'] = [name]
        with self.assertRaisesRegex(ValueError, 'Incoming checksum'):
            self.call('accept')
        self.assertEqual(public.read_bytes(), self.content[name])
        incoming.write_bytes(self.content[name])
        self.call('accept')
        self.assertEqual(public.stat().st_ino, original_inode)
        self.assertNotEqual((self.stage / name).stat().st_ino, original_inode)
        self.assertEqual(public.read_bytes(), self.content[name])

    def test_corrupt_upload_never_changes_feed(self):
        self.upload()
        (self.stage / self.artifacts[0]).write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.call('artifacts')
        self.assertEqual((self.root / 'updates/latest.json').read_bytes(), self.original['updates/latest.json'])

    def test_concurrent_metadata_change_is_preserved(self):
        self.upload(); self.call('artifacts')
        p = self.root / 'index.html'; p.write_text('other deployment')
        with self.assertRaisesRegex(ValueError, 'changed since upload'):
            self.call('activate')
        self.assertEqual(p.read_text(), 'other deployment')
        self.assertEqual((self.root / 'updates/latest.json').read_bytes(), self.original['updates/latest.json'])

    def test_interrupted_activation_resumes_and_preserves_original_backup(self):
        self.upload(); self.call('artifacts')
        real = os.replace
        calls = 0
        def interrupt(src, dst):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError('simulated disconnect')
            real(src, dst)
        with patch.object(server.os, 'replace', side_effect=interrupt):
            with self.assertRaises(OSError):
                self.call('activate')
        self.call('activate'); self.call('verify')
        for n, b in self.original.items():
            self.assertEqual((self.stage / 'backup' / n).read_bytes(), b)

    def test_another_run_cannot_replace_version_even_with_same_bytes(self):
        self.upload(); self.call('artifacts'); self.call('activate')
        self.request['run'] = 'auto-9.1.0-' + 'b' * 12
        with self.assertRaisesRegex(ValueError, 'existing/newer'):
            self.call('init')

    def test_verify_has_no_server_writes(self):
        self.upload(); self.call('artifacts'); self.call('activate')
        (self.root / '.cubeoffice-release.lock').unlink()
        before = sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*'))
        self.call('verify')
        self.assertEqual(before, sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*')))

    def test_changed_staging_owner_is_rejected(self):
        self.upload()
        self.request['inventory']['index.html']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'different artifacts'):
            self.call('init')


class LocalGuards(unittest.TestCase):
    def test_dry_run_never_sources_config_or_creates_work(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            notes = root / 'notes.md'; notes.write_text('改进体验\nImproved editing\n')
            config = root / 'config.sh'; marker = root / 'executed'
            config.write_text('touch "' + str(marker) + '"\n')
            result = subprocess.run(['bash', str(REPO / 'scripts/release-cubeoffice.sh'), 'all', '--version', '9.1.0', '--android-code', '9001000', '--notes', str(notes), '--config', str(config), '--work-dir', str(root / 'work'), '--dry-run'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(marker.exists()); self.assertFalse((root / 'work').exists())

    def test_prepare_updates_both_versions_without_changing_svg_geometry(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'profiles/cubeoffice/desktop').mkdir(parents=True)
            (root / 'profiles/cubeoffice/desktop/catalog.mjs').write_text('version: "1.3.1"')
            release.write(root / 'profiles/cubeoffice/app.json', {'versionName': '1.3.1', 'versionCode': 1})
            (root / 'website').mkdir(); (root / 'releases').mkdir()
            for page in release.PAGES:
                (root / 'website' / page).write_text('<path d="1.3.1"/> CubeOffice 1.3.1 /downloads/CubeOffice-1.3.1-Android-b1.apk')
            notes = root / 'notes.md'; notes.write_text('改进编辑。 Improved editing.')
            subprocess.run(['python3', str(HELPERS / 'release.py'), 'prepare', str(root), '1.4.0', '1004000', str(notes)], check=True)
            self.assertIn('d="1.3.1"', (root / 'website/index.html').read_text())
            self.assertIn('CubeOffice-1.4.0-Android-b1004000.apk', (root / 'website/index.html').read_text())
            self.assertEqual(release.read(root / 'profiles/cubeoffice/app.json')['versionCode'], 1004000)

    def test_receipt_rejects_mixed_source_and_modified_artifact(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            s = {'version': '9.1.0', 'androidVersionCode': 9001000, 'distribution': 'a' * 40, 'upstream': 'b' * 40}
            release.write(root / 'release.json', s)
            p = root / 'artifacts/android'; p.mkdir(parents=True)
            artifact = p / release.raw_names(s)['android'][0]; artifact.write_bytes(b'APK')
            release.receipt(root, 'android')
            self.assertTrue(release.receipt_check(root, 'android'))
            artifact.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'Artifact changed'):
                release.receipt_check(root, 'android')
            artifact.write_bytes(b'APK')
            s['upstream'] = 'c' * 40; release.write(root / 'release.json', s)
            with self.assertRaisesRegex(ValueError, 'Mixed build source'):
                release.receipt_check(root, 'android')

    def test_signature_rejects_changed_artifact_and_wrong_key(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            js = r'''
const fs=require('fs'),c=require('crypto'),p=process.argv[1];
const {privateKey,publicKey}=c.generateKeyPairSync('ed25519');
const id=c.randomBytes(8),key=publicKey.export({format:'der',type:'spki'}).subarray(-32);
const pub=Buffer.concat([Buffer.from('Ed'),id,key]);
fs.writeFileSync(p+'/key.pub',Buffer.from('untrusted comment: test\n'+pub.toString('base64')).toString('base64'));
const data=Buffer.from('release contents');fs.writeFileSync(p+'/artifact',data);
const sig=c.sign(null,c.createHash('blake2b512').update(data).digest(),privateKey),trusted='timestamp:1';
const raw=Buffer.concat([Buffer.from('ED'),id,sig]);
const text='untrusted comment: test\n'+raw.toString('base64')+'\ntrusted comment: '+trusted+'\n'+c.sign(null,Buffer.concat([sig,Buffer.from(trusted)]),privateKey).toString('base64');
fs.writeFileSync(p+'/artifact.sig',Buffer.from(text).toString('base64'));
'''
            subprocess.run(['node', '-e', js, str(root)], check=True)
            cmd = ['node', str(HELPERS / 'validate.mjs'), 'signature', str(root / 'key.pub'), str(root / 'artifact')]
            self.assertEqual(subprocess.run(cmd, capture_output=True).returncode, 0)
            (root / 'artifact').write_text('corrupt')
            self.assertNotEqual(subprocess.run(cmd, capture_output=True).returncode, 0)
            (root / 'artifact').write_text('release contents')
            lines = base64.b64decode((root / 'key.pub').read_bytes()).decode().split('\n')
            raw = bytearray(base64.b64decode(lines[1])); raw[2] ^= 1
            lines[1] = base64.b64encode(raw).decode()
            (root / 'key.pub').write_bytes(base64.b64encode('\n'.join(lines).encode()))
            self.assertNotEqual(subprocess.run(cmd, capture_output=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
