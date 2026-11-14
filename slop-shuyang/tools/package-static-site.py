"""Package committed runtime files for an arbitrary static host (no credentials)."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()


def main():
    if git('status', '--porcelain'):
        raise SystemExit('Commit changes before packaging so the release matches its source SHA.')
    sha = git('rev-parse', 'HEAD')
    out = ROOT / '.releases'
    out.mkdir(exist_ok=True)
    archive = out / ('shuyang-' + sha[:7] + '.zip')
    subprocess.run(['git', '-C', str(ROOT), 'archive', '--format=zip', '--output=' + str(archive),
                    sha, 'index.html', 'css', 'js', 'LICENSE', 'README.md'], check=True)
    manifest = {'commit': sha, 'site': '沭阳漫游', 'type': 'static',
                'entrypoint': 'index.html', 'externalDependencies': ['https://cdn.jsdelivr.net/npm/three@0.187.0/']}
    with zipfile.ZipFile(archive, 'a', compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr('release.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        assert 'index.html' in names and 'js/building-geodata.bin.gz' in names
        assert 'js/jiusheng-precinct.js' in names and bundle.testzip() is None
        assert not any(name.startswith(('tools/', 'docs/', '.workbuddy/')) for name in names)
    result = {'archive': str(archive), 'commit': sha, 'files': len(names),
              'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
    (out / (archive.stem + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
