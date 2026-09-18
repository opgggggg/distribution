"""Executed via SSH stdin; only explicit public release files may be changed."""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys


def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def file_ok(p, expected):
    return p.is_file() and not p.is_symlink() and p.stat().st_size == expected['size'] and sha(p) == expected['sha256']


@contextlib.contextmanager
def no_lock():
    """Keep read-only verification compatible with the server's Python 3.6."""
    yield None


def main(request):
    root = Path(request['root']); stage = root / '.release-staging' / request['run']
    inventory = request['inventory']; action = request['action']; s = request['release']
    artifacts, metadata = request['artifacts'], request['metadata']
    require(root.is_absolute() and root.is_dir(), 'Invalid web root')
    require(re.fullmatch(r'auto-\d+\.\d+\.\d+-[a-f0-9]{12}', request['run']), 'Invalid run identifier')
    for name in inventory:
        require(not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unsafe release path')
    require(set(artifacts + metadata + ['release.json']) == set(inventory), 'Unexpected inventory entries')
    require(len(artifacts) == 11 and len(metadata) == 7, 'Incomplete release')
    # Hash-only verification deliberately performs no remote writes, including lock creation.
    lock = no_lock() if action == 'verify' else (root / '.cubeoffice-release.lock').open('a')
    with lock as handle:
        if handle is not None:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'init':
            if stage.exists():
                owner = json.loads((stage / 'owner.json').read_text(encoding='utf-8'))
                require(owner['inventory'] == inventory, 'Existing staging directory belongs to different artifacts')
            else:
                desktop = json.loads((root / 'updates/latest.json').read_text(encoding='utf-8'))
                android = json.loads((root / 'updates/android/latest.json').read_text(encoding='utf-8'))
                require(tuple(map(int, desktop['version'].split('.'))) < tuple(map(int, s['version'].split('.'))), 'Cannot replace an existing/newer release')
                require(android['versionCode'] < s['androidVersionCode'], 'Cannot replace an existing/newer Android build')
                require(not (root / 'updates' / s['version']).exists(), 'Version directory already exists')
                require(not list((root / 'downloads').glob('CubeOffice-' + s['version'] + '-*')), 'Versioned downloads already exist')
                baseline = {n: sha(root / n) if (root / n).exists() else None for n in metadata}
                stage.mkdir(parents=True)
                (stage / 'owner.json').write_text(json.dumps({'inventory': inventory, 'baseline': baseline}), encoding='utf-8')
            print('Remote staging reserved')
            return
        if action == 'verify':
            for name in artifacts + metadata:
                require(file_ok(root / name, inventory[name]), 'Live checksum mismatch: ' + name)
            print('All live file hashes verified')
            return
        owner = json.loads((stage / 'owner.json').read_text(encoding='utf-8'))
        require(owner['inventory'] == inventory, 'Staging owner mismatch')
        if action == 'missing':
            print(json.dumps([n for n, expected in inventory.items() if not file_ok(stage / n, expected)]))
            return
        if action == 'accept':
            uploads = request['uploads']
            require(set(uploads) <= set(inventory), 'Unexpected upload entry')
            for name in uploads:
                incoming = stage / (name + '.upload')
                require(file_ok(incoming, inventory[name]), 'Incoming checksum mismatch: ' + name)
            for name in uploads:
                # Never truncate an existing staged inode: it may be hard-linked publicly.
                os.replace(stage / (name + '.upload'), stage / name)
            print('Uploaded files accepted')
            return
        for name, expected in inventory.items():
            require(file_ok(stage / name, expected), 'Uploaded checksum mismatch: ' + name)
        if action == 'artifacts':
            for name in artifacts:
                src, dst = stage / name, root / name
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.parent.chmod(0o755)
                if dst.exists():
                    require(file_ok(dst, inventory[name]), 'Refusing to overwrite artifact: ' + name)
                else:
                    src.chmod(0o644)
                    os.link(src, dst)  # exclusive creation, no replacement
            print('Versioned artifacts verified and published')
        elif action == 'activate':
            for name in artifacts:
                require(file_ok(root / name, inventory[name]), 'Public artifact changed: ' + name)
            # Compare-and-swap guards unrelated deployments, including partial retry state.
            for name in metadata:
                current = sha(root / name) if (root / name).exists() else None
                require(current in [owner['baseline'][name], inventory[name]['sha256']], 'Live metadata changed since upload began: ' + name)
            for name in metadata:
                dst = root / name
                if file_ok(dst, inventory[name]):
                    continue
                backup = stage / 'backup' / name
                backup.parent.mkdir(parents=True, exist_ok=True)
                if dst.exists() and not backup.exists():
                    shutil.copyfile(dst, backup)
                dst.parent.mkdir(parents=True, exist_ok=True)
                temp = dst.with_name(dst.name + '.' + request['run'] + '.tmp')
                shutil.copyfile(stage / name, temp)
                temp.chmod(0o644)
                os.replace(temp, dst)
            print('Website and both feeds published atomically per file; backups retained')
        else:
            raise ValueError('Invalid server action')


if __name__ == '__main__':
    main(json.load(sys.stdin))
