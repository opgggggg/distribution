#!/usr/bin/env python3
"""Data and transport helpers for release-cubeoffice.sh (no third-party Python deps)."""
import base64
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from datetime import datetime, timezone

ORIGIN = 'https://cubexp.com'
PAGES = ['i18n.js', 'templates.html', 'visio.html', 'index.html']
FEEDS = ['updates/android/latest.json', 'updates/latest.json']


def run(*args, **kw):
    return subprocess.run([str(a) for a in args], check=True, **kw)


def output(*args):
    return subprocess.check_output([str(a) for a in args], text=True).strip()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent='\t') + '\n')
    os.replace(temp, path)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def info(path):
    return {'sha256': digest(path), 'size': Path(path).stat().st_size}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def version(v):
    require(re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', v), 'Invalid stable version')
    return tuple(map(int, v.split('.')))


def fetch(path):
    req = urllib.request.Request(ORIGIN + '/' + path, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def notes_text(path):
    s = Path(path).read_text().strip()
    if s.startswith('# '):
        s = s.split('\n', 1)[1].strip()
    require(s and re.search(r'[\u4e00-\u9fff]', s) and re.search(r'[A-Za-z]{3}', s), 'Provide reviewed Chinese and English release notes')
    return s + '\n'


def raw_names(s):
    v, c = s['version'], s['androidVersionCode']
    return {
        'macos': [f'CubeOffice_{v}_aarch64.dmg', 'CubeOffice.app.tar.gz', 'CubeOffice.app.tar.gz.sig'],
        'windows': [f'CubeOffice_{v}_x64-setup.exe', f'CubeOffice_{v}_x64-setup.exe.sig'],
        'linux': [f'CubeOffice_{v}_amd64.AppImage', f'CubeOffice_{v}_amd64.AppImage.sig', f'CubeOffice_{v}_amd64.deb'],
        'android': [f'CubeOffice-{v}-Android-b{c}.apk'],
    }


def canonical(s):
    v, c = s['version'], s['androidVersionCode']
    downloads = [f'CubeOffice-{v}-macOS-arm64.dmg', f'CubeOffice-{v}-Windows-x64-setup.exe',
                 f'CubeOffice-{v}-Linux-x86_64.AppImage', f'CubeOffice-{v}-Linux-x86_64.deb',
                 f'CubeOffice-{v}-Android-b{c}.apk']
    updates = [f'CubeOffice-{v}-macOS-arm64.app.tar.gz', downloads[1], downloads[2]]
    return ['downloads/' + n for n in downloads] + [f'updates/{v}/{n}{suffix}' for n in updates for suffix in ['', '.sig']]


def source_check(work):
    s = read(work / 'release.json')
    src = work / 'source'
    require(output('git', '-C', src, 'rev-parse', 'HEAD') == s['distribution'], 'Distribution revision changed')
    require(output('git', '-C', src, 'rev-parse', 'HEAD:als-office') == s['upstream'], 'Recorded submodule changed')
    require(output('git', '-C', src / 'als-office', 'rev-parse', 'HEAD') == s['upstream'], 'Upstream revision changed')
    for repo in [src, src / 'als-office']:
        run('git', '-C', repo, 'diff', '--quiet', 'HEAD', '--ignore-submodules=untracked')
    require(digest(work / 'source.tar.gz') == s['archiveSha256'], 'Source archive changed')
    return s


def receipt_check(work, platform):
    s = read(work / 'release.json')
    p = work / 'artifacts' / platform / 'receipt.json'
    if not p.exists():
        return False
    r = read(p)
    require(r['distribution'] == s['distribution'] and r['upstream'] == s['upstream'], 'Mixed build source identities')
    require(set(r['files']) == set(raw_names(s)[platform]), 'Incomplete artifact receipt')
    for name, expected in r['files'].items():
        require(info(p.parent / name) == expected and expected['size'] > 0, 'Artifact changed: ' + name)
    return True


def receipt(work, platform):
    s = read(work / 'release.json')
    root = work / 'artifacts' / platform
    files = {n: info(root / n) for n in raw_names(s)[platform]}
    require(all(i['size'] > 0 for i in files.values()), 'Empty build output')
    write(root / 'receipt.json', {**{k: s[k] for k in ['distribution', 'upstream']}, 'files': files})


def validate_stage(stage, source, helpers):
    s = read(stage / 'release.json')
    version(s['version'])
    require(type(s['androidVersionCode']) is int and 0 < s['androidVersionCode'] <= 2100000000, 'Invalid Android code')
    expected = set(canonical(s) + PAGES + FEEDS + ['downloads/SHA256SUMS.txt', 'release.json'])
    inventory = read(stage / 'inventory.json')
    require(set(inventory) == expected, 'Stage inventory has missing/unexpected files')
    for name, expected_info in inventory.items():
        p = stage / name
        require(not p.is_symlink() and p.is_file(), 'Invalid staged file: ' + name)
        require(re.fullmatch('[a-f0-9]{64}', expected_info['sha256']), 'Invalid checksum')
        require(info(p) == expected_info and expected_info['size'] > 0, 'Stage checksum mismatch: ' + name)
    d, a = read(stage / FEEDS[1]), read(stage / FEEDS[0])
    require(d['version'] == s['version'], 'Desktop feed version mismatch')
    require(a['versionName'] == s['version'] and a['versionCode'] == s['androidVersionCode'], 'Android feed version mismatch')
    platforms = dict(zip(['darwin-aarch64', 'windows-x86_64', 'linux-x86_64'], [canonical(s)[5], canonical(s)[7], canonical(s)[9]]))
    require(set(d['platforms']) == set(platforms), 'Incomplete desktop feed')
    datetime.fromisoformat(d['pub_date'].replace('Z', '+00:00'))
    for key, path in platforms.items():
        p = d['platforms'][key]
        require(p['url'] == ORIGIN + '/' + path, 'Wrong updater URL')
        require(p['signature'] == (stage / (path + '.sig')).read_text().strip(), 'Wrong updater signature')
        run('node', helpers / 'validate.mjs', 'signature', os.environ['UPDATER_PUBLIC_KEY'], stage / path)
    apk = canonical(s)[4]
    require(a['url'] == ORIGIN + '/' + apk and a['sha256'] == digest(stage / apk), 'Wrong Android artifact hash/URL')
    require(a['notes'] == d['notes'] == s['notes'], 'Release notes changed')
    run('node', helpers / 'validate.mjs', 'feed', source, stage / FEEDS[0], s['version'], str(s['androidVersionCode']))
    sums = {}
    for line in (stage / 'downloads/SHA256SUMS.txt').read_text().splitlines():
        if not line.strip():
            continue
        h, n = line.split(maxsplit=1)
        require(re.fullmatch('[a-f0-9]{64}', h), 'Invalid SHA256SUMS entry')
        require(n not in sums or sums[n] == h, 'Conflicting checksum entry')
        sums[n] = h
    for path in canonical(s)[:5]:
        require(sums.get(Path(path).name) == digest(stage / path), 'Installer checksum missing')
    html = (stage / 'index.html').read_text()
    require(set(re.findall(r'href="(/downloads/CubeOffice-[^"]+)"', html)) == {'/' + p for p in canonical(s)[:5]}, 'Website download mismatch')
    h = digest(stage / 'i18n.js')[:12]
    for page in ['index.html', 'templates.html', 'visio.html']:
        require(f'/i18n.js?v={h}' in (stage / page).read_text(), 'Stale translation cache URL')
    require('Desktop ' + s['version'] in (stage / 'i18n.js').read_text(), 'Missing English version')
    return s, inventory


def windows(work, helper, mode):
    s = read(work / 'release.json')
    if mode == 'build' and receipt_check(work, 'windows'):
        return
    root = os.environ['WINDOWS_ROOT'].rstrip('/')
    host = os.environ['WINDOWS_HOST']
    require(re.fullmatch(r'[A-Za-z]:/[A-Za-z0-9_./-]+', root), 'WINDOWS_ROOT must be an absolute Windows path without spaces')
    require(re.fullmatch(r'[A-Za-z0-9_.@:-]+', host) and not host.startswith('-'), 'Invalid Windows SSH host')
    remote = root + '/cubeoffice-auto-' + s['version'] + '-' + s['distribution'][:12]
    cfg = {**s, 'work': remote, 'key': os.environ['WINDOWS_UPDATER_KEY'], 'cache': os.environ['WINDOWS_TARGET_CACHE'],
           'minFreeGB': float(os.environ['WINDOWS_MIN_FREE_GB']), 'proxy': os.environ['WINDOWS_PROXY']}
    write(work / 'windows-config.json', cfg)
    ssh = ['ssh', '-i', os.environ['WINDOWS_SSH_KEY'], '-o', 'BatchMode=yes', host]
    scp = ['scp', '-i', os.environ['WINDOWS_SSH_KEY'], '-o', 'BatchMode=yes']
    def ps(code):
        encoded = base64.b64encode(code.encode('utf-16le')).decode()
        run(*ssh, 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + encoded)
    def q(x):
        return "'" + x.replace("'", "''") + "'"
    # Control files have release-specific names; never overwrite another release's scripts.
    script = remote + '.ps1'
    config = remote + '.json'
    run(*scp, helper, host + ':' + script)
    run(*scp, work / 'windows-config.json', host + ':' + config)
    if mode == 'build':
        run(*scp, work / 'source.tar.gz', host + ':' + remote + '.tar.gz')
    ps("$ErrorActionPreference='Stop'; try { & " + q(script) + ' -Config ' + q(config) + ' -Mode ' + q(mode) + "; exit $LASTEXITCODE } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }")
    if mode == 'build':
        dest = work / 'artifacts/windows'
        dest.mkdir(exist_ok=True)
        for name in raw_names(s)['windows'] + ['verification.json']:
            run(*scp, host + ':' + remote + '/out/' + name, dest / name)
        require(read(dest / 'verification.json')['distribution'] == s['distribution'], 'Windows receipt identity mismatch')
        receipt(work, 'windows')


def main():
    cmd, *args = sys.argv[1:]
    if cmd == 'get':
        print(read(args[0])[args[1]])
    elif cmd == 'check-new':
        v, code = args
        require(0 < int(code) <= 2100000000, 'Android versionCode out of range')
        require(version(v) > version(json.loads(fetch(FEEDS[1]))['version']), 'Version already published or older than live')
        require(int(code) > json.loads(fetch(FEEDS[0]))['versionCode'], 'Android code must exceed live code')
    elif cmd == 'prepare':
        src, v, code, notes = args
        src = Path(src); version(v)
        catalog = src / 'profiles/cubeoffice/desktop/catalog.mjs'
        text = catalog.read_text(); old = re.findall(r'\bversion: "(\d+\.\d+\.\d+)"', text)
        require(len(old) == 1, 'Ambiguous desktop version')
        catalog.write_text(text.replace('version: "' + old[0] + '"', 'version: "' + v + '"'))
        profile = src / 'profiles/cubeoffice/app.json'
        data = read(profile); data.update(versionName=v, versionCode=int(code)); write(profile, data)
        for f in PAGES:
            p = src / 'website' / f
            # Replace version labels/URLs, not SVG path coordinates containing the same digits.
            parts = re.split(r'(\bd="[^"]*")', p.read_text())
            t = ''.join(part if part.startswith('d="') else re.sub(r'(?<![\d.])' + re.escape(old[0]) + r'(?![\d.])', v, part) for part in parts)
            t = re.sub(r'CubeOffice-\d+\.\d+\.\d+-Android-b\d+\.apk', f'CubeOffice-{v}-Android-b{code}.apk', t)
            p.write_text(t)
        (src / 'releases' / (v + '.md')).write_text('# CubeOffice ' + v + '\n\n' + notes_text(notes))
    elif cmd == 'cache-bust':
        src = Path(args[0]); h = digest(src / 'website/i18n.js')[:12]
        for f in ['index.html', 'templates.html', 'visio.html']:
            p = src / 'website' / f
            p.write_text(re.sub(r'/i18n\.js\?v=[^"\s]+', '/i18n.js?v=' + h, p.read_text()))
    elif cmd == 'snapshot':
        work, v, code = args; work = Path(work); src = work / 'source'
        s = {'version': v, 'androidVersionCode': int(code), 'distribution': output('git', '-C', src, 'rev-parse', 'HEAD'),
             'upstream': output('git', '-C', src / 'als-office', 'rev-parse', 'HEAD'), 'notes': notes_text(src / 'releases' / (v + '.md'))}
        require(output('git', '-C', src, 'rev-parse', 'HEAD:als-office') == s['upstream'], 'Uncommitted upstream')
        with tempfile.TemporaryDirectory(dir=work) as temp:
            dest = Path(temp); (dest / 'als-office').mkdir()
            for repo, target in [(src, dest), (src / 'als-office', dest / 'als-office')]:
                p = subprocess.Popen(['git', '-C', str(repo), 'archive', 'HEAD'], stdout=subprocess.PIPE)
                run('tar', '-x', '-C', target, stdin=p.stdout); p.stdout.close()
                require(p.wait() == 0, 'git archive failed')
            write(dest / 'BUILD-IDENTITY.json', s)
            with tarfile.open(work / 'source.tar.gz', 'w:gz') as tar:
                for p in sorted(dest.iterdir()):
                    tar.add(p, arcname=p.name)
        s['archiveSha256'] = digest(work / 'source.tar.gz')
        write(work / 'release.json', s)
    elif cmd == 'source-check':
        source_check(Path(args[0]))
    elif cmd == 'notes-check':
        require(read(Path(args[0]) / 'release.json')['notes'].split() == notes_text(args[1]).split(), 'Notes differ from saved release')
    elif cmd == 'find-java':
        candidates = sorted((Path.home() / 'Library/Java/JavaVirtualMachines').glob('*/Contents/Home'), reverse=True)
        match = next((p for p in candidates if (p / 'bin/jlink').is_file() and (p / 'bin/javac').is_file()), None)
        require(match is not None, 'No complete JDK found'); print(match)
    elif cmd == 'rust-path':
        current, preferred = args
        print(':'.join([preferred] + [p for p in current.split(':') if p != str(Path.home() / '.cargo/bin') and p != preferred]))
    elif cmd == 'receipt-check':
        sys.exit(0 if receipt_check(Path(args[0]), args[1]) else 1)
    elif cmd == 'receipt':
        receipt(Path(args[0]), args[1])
    elif cmd == 'windows':
        windows(Path(args[0]), Path(args[1]), args[2])
    elif cmd == 'mac-check':
        app = Path(args[0]); p = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
        require(p['CFBundleShortVersionString'] == args[1] and p['CFBundleIdentifier'] == 'com.cubexp.office', 'Wrong macOS bundle identity')
        require('arm64' in output('file', app / 'Contents/MacOS/cubeoffice-app'), 'Wrong macOS architecture')
    elif cmd == 'android-check':
        work = Path(args[0]); s = read(work / 'release.json'); t = (work / 'logs/android-package.txt').read_text()
        require(f"name='com.cubexp.office' versionCode='{s['androidVersionCode']}' versionName='{s['version']}'" in t and "sdkVersion:'26'" in t, 'Wrong Android metadata')
        # Compare with the currently distributed APK certificate before allowing upgrade publication.
        feed = json.loads(fetch(FEEDS[0])); require(feed['url'].startswith(ORIGIN + '/downloads/'), 'Invalid previous APK URL')
        apk = work / 'previous-android.apk'
        with urllib.request.urlopen(feed['url'], timeout=120) as response, apk.open('wb') as f:
            shutil.copyfileobj(response, f)
        require(digest(apk) == feed['sha256'], 'Previous APK checksum mismatch')
        tool = Path(os.environ['ANDROID_HOME']) / 'build-tools' / os.environ.get('ANDROID_BUILD_TOOLS', '35.0.0') / 'apksigner'
        previous = output(tool, 'verify', '--print-certs', apk)
        current = (work / 'logs/android-signature.txt').read_text()
        pattern = r'certificate SHA-256 digest: ([a-f0-9]{64})'
        require(re.search(pattern, previous)[1] == re.search(pattern, current)[1], 'Android signing certificate changed')
    elif cmd == 'stage':
        work, helpers = map(Path, args); s = source_check(work); source = work / 'source'
        for platform in raw_names(s):
            require(receipt_check(work, platform), 'Missing platform: ' + platform)
        if (work / 'stage').exists():
            validate_stage(work / 'stage', source, helpers); print('Reusing verified stage'); return
        with tempfile.TemporaryDirectory(prefix='stage-', dir=work) as temp:
            stage = Path(temp) / 'payload'
            a = work / 'artifacts'; names = raw_names(s)
            run('node', source / '.agents/skills/cubeoffice-release/scripts/stage-release.mjs', '--version', s['version'], '--notes', s['notes'], '--output', stage,
                '--mac-dmg', a / 'macos' / names['macos'][0], '--mac-updater', a / 'macos' / names['macos'][1], '--windows', a / 'windows' / names['windows'][0],
                '--linux-appimage', a / 'linux' / names['linux'][0], '--linux-deb', a / 'linux' / names['linux'][2])
            apk = names['android'][0]; shutil.copyfile(a / 'android' / apk, stage / 'downloads' / apk)
            sha = digest(stage / 'downloads' / apk)
            old = fetch('downloads/SHA256SUMS.txt').decode().rstrip() + '\n'
            p = stage / 'downloads/SHA256SUMS.txt'; p.write_text(old + p.read_text() + f'{sha}  {apk}\n')
            write(stage / FEEDS[0], {'versionName': s['version'], 'versionCode': s['androidVersionCode'], 'minSdk': 26, 'url': ORIGIN + '/downloads/' + apk, 'sha256': sha, 'notes': s['notes']})
            for f in PAGES:
                shutil.copyfile(source / 'website' / f, stage / f)
            write(stage / 'release.json', s)
            write(stage / 'inventory.json', {str(p.relative_to(stage)): info(p) for p in stage.rglob('*') if p.is_file()})
            validate_stage(stage, source, helpers)
            os.rename(stage, work / 'stage')
        print('Staged all four platforms')
    elif cmd == 'validate-stage':
        validate_stage(*map(Path, args))
    elif cmd == 'report':
        work = Path(args[0]); s = read(work / 'release.json'); inventory = read(work / 'stage/inventory.json')
        report = {**s, 'status': 'published', 'verifiedAt': datetime.now(timezone.utc).isoformat(),
                  'artifacts': {n: {**inventory[n], 'url': ORIGIN + '/' + n} for n in canonical(s)},
                  'checks': ['Native build identities and smoke checks', 'Android certificate continuity', 'Three cryptographic updater signatures', 'Local and remote SHA-256 checks', 'Public HTTPS byte ranges and live feed validation'],
                  'limits': ['macOS ad-hoc signed, not notarized; Windows has no Authenticode certificate.', 'Automated service/build/package checks do not replace physical Android and desktop GUI testing.']}
        write(work / 'report.json', report)
    else:
        raise ValueError('Unknown helper command: ' + cmd)


if __name__ == '__main__':
    main()
