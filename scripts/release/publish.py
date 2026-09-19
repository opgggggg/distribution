#!/usr/bin/env python3
"""Restartable SSH publisher. Server-side mutation rules are in server.py."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import urllib.request
from release import ORIGIN, PAGES, FEEDS, canonical, fetch, info, notes_file, notes_text, read, require, validate_stage, run, write


def notes(repo, version, helpers, stage=None):
    """Republish the notes of an already-published release, and nothing else.

    The updater dialog shows this string, and the client that shows it is always
    the older one - so notes that are too long can leave users unable to reach
    the update button. Correcting them must not require rebuilding or replacing
    artifacts that are already public and immutable.
    """
    text = notes_text(notes_file(repo, version))
    host, key, root = (os.environ[k] for k in ['CUBEXP_SSH_HOST', 'CUBEXP_SSH_KEY', 'CUBEXP_WEB_ROOT'])
    require(re.fullmatch(r'[A-Za-z0-9_.@:-]+', host) and not host.startswith('-'), 'Invalid SSH host')
    require(re.fullmatch(r'/[A-Za-z0-9_./-]+', root) and '..' not in Path(root).parts and root != '/', 'Invalid web root')
    payload = {}
    for name in FEEDS:
        live = json.loads(fetch(name).decode())
        field = 'versionName' if '/android/' in name else 'version'
        require(live[field] == version, name + ' publishes ' + live[field] + ', not ' + version)
        payload[name] = json.dumps({**live, 'notes': text}, ensure_ascii=False, indent='\t') + '\n'
    server = (helpers / 'server.py').read_text()
    run('ssh', '-i', key, '-o', 'BatchMode=yes', host, 'python3 -c ' + shlex.quote(server),
        input=json.dumps({'root': root, 'action': 'notes', 'notes': payload}), text=True)
    for name in FEEDS:
        published = json.loads(fetch(name).decode())
        require(published['notes'] == text, 'Live notes did not change: ' + name)
        field = 'versionName' if '/android/' in name else 'version'
        require(published[field] == version, 'Live feed moved: ' + name)
    # The staged copy is the record of what is public, so bring it along:
    # otherwise `verify` compares the live feeds against notes nobody serves.
    if stage and stage.is_dir():
        record = read(stage / 'release.json')
        if record['version'] == version:
            record['notes'] = text
            write(stage / 'release.json', record)
            inventory = read(stage / 'inventory.json')
            for name in FEEDS:
                (stage / name).write_text(payload[name], encoding='utf-8')
                inventory[name] = info(stage / name)
            inventory['release.json'] = info(stage / 'release.json')
            write(stage / 'inventory.json', inventory)
            print('Staged record updated to match the live notes')
    print('Notes republished for', version)


def publish(action, stage, source, helpers):
    s, inventory = validate_stage(stage, source, helpers)
    artifacts = canonical(s)
    metadata = ['downloads/SHA256SUMS.txt'] + PAGES + FEEDS
    host, key, root = (os.environ[k] for k in ['CUBEXP_SSH_HOST', 'CUBEXP_SSH_KEY', 'CUBEXP_WEB_ROOT'])
    require(re.fullmatch(r'[A-Za-z0-9_.@:-]+', host) and not host.startswith('-'), 'Invalid SSH host')
    require(re.fullmatch(r'/[A-Za-z0-9_./-]+', root) and '..' not in Path(root).parts and root != '/', 'Invalid web root')
    run_id = 'auto-' + s['version'] + '-' + s['distribution'][:12]
    remote = root + '/.release-staging/' + run_id
    request = {'root': root, 'run': run_id, 'release': s, 'inventory': inventory, 'artifacts': artifacts, 'metadata': metadata}
    server = (helpers / 'server.py').read_text()
    def remote_action(a, capture=False, **extra):
        result = run('ssh', '-i', key, '-o', 'BatchMode=yes', host, 'python3 -c ' + shlex.quote(server),
            input=json.dumps({**request, 'action': a, **extra}), text=True, capture_output=capture)
        return json.loads(result.stdout) if capture else None
    def public(paths):
        def check(name):
            expected = inventory[name]
            url = ORIGIN + '/' + name
            if name in artifacts:
                req = urllib.request.Request(url, method='HEAD', headers={'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req, timeout=60) as response:
                    require(int(response.headers['Content-Length']) == expected['size'], 'Public size mismatch: ' + name)
                for begin in [0, max(0, expected['size'] - 1024)]:
                    end = min(begin + 1023, expected['size'] - 1)
                    req = urllib.request.Request(url, headers={'Range': f'bytes={begin}-{end}', 'Cache-Control': 'no-cache'})
                    with urllib.request.urlopen(req, timeout=60) as response:
                        require(response.status == 206, 'Server must support byte ranges')
                        data = response.read(1025)
                    with (stage / name).open('rb') as file:
                        file.seek(begin)
                        require(file.read(end - begin + 1) == data, 'Public range mismatch: ' + name)
            else:
                data = fetch(name)
                require(len(data) == expected['size'] and hashlib.sha256(data).hexdigest() == expected['sha256'], 'Public metadata mismatch: ' + name)
            print('HTTPS verified:', name, flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(check, paths))
    if action == 'publish':
        # Upload exact inventory entries only; never recursively upload a private work directory.
        remote_action('init')
        for directory in ['updates/' + s['version'], 'downloads', 'updates/android']:
            run('ssh', '-i', key, '-o', 'BatchMode=yes', host, 'mkdir -p ' + shlex.quote(remote + '/' + directory))
        missing = remote_action('missing', capture=True)
        require(set(missing) <= set(inventory), 'Server requested an unexpected file')
        for name in missing:
            run('scp', '-i', key, '-o', 'BatchMode=yes', stage / name, host + ':' + remote + '/' + name + '.upload')
        remote_action('accept', uploads=missing)
        remote_action('artifacts')
        public(artifacts)  # A failure here cannot switch the live feeds.
        remote_action('activate')
    elif action != 'verify':
        raise ValueError('Expected publish or verify')
    remote_action('verify')
    public(artifacts + metadata if action == 'verify' else metadata)
    live = stage.parent / 'live'
    live.mkdir(exist_ok=True)
    for name in FEEDS:
        target = live / ('android.json' if '/android/' in name else 'desktop.json')
        target.write_bytes(fetch(name))
        require(target.read_bytes() == (stage / name).read_bytes(), 'Live feed differs from staged feed')
    run('node', helpers / 'validate.mjs', 'feed', source, live / 'android.json', s['version'], str(s['androidVersionCode']))
    print('Release verified:', s['version'])


if __name__ == '__main__':
    if sys.argv[1] == 'notes':
        notes(Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4]),
              Path(sys.argv[5]) if len(sys.argv) > 5 else None)
    else:
        publish(sys.argv[1], *map(Path, sys.argv[2:5]))
