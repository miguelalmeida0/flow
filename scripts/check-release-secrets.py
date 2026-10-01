"""Check release files for live companion credentials without printing secrets."""
import json
import pathlib
import subprocess
import zipfile

root = pathlib.Path.cwd()
tokens = []
for name in ('token', 'voice-token'):
    p = pathlib.Path.home() / '.flow-companion' / name
    if p.is_file():
        token = p.read_bytes().strip()
        if len(token) >= 32:
            tokens.append(token)
paths = set(subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).decode().split('\0'))
for parent in ('dist', 'artifacts'):
    paths.update(str(p) for p in pathlib.Path(parent).rglob('*') if p.is_file())
leaks = []
scanned = 0
for value in sorted(paths):
    if not value:
        continue
    p = root / value
    if not p.is_file() or p.is_symlink():
        continue
    # Audio bytes cannot contain a textual credential; diagnostics/archives can.
    if p.suffix in ('.wav', '.webm', '.mp4'):
        continue
    data = p.read_bytes()
    scanned += 1
    if any(token in data for token in tokens):
        leaks.append(value)
    if p.suffix == '.zip':
        with zipfile.ZipFile(p) as archive:
            for item in archive.infolist():
                if item.file_size < 50_000_000 and any(token in archive.read(item) for token in tokens):
                    leaks.append(value + ':' + item.filename)
result = {'status': 'FAIL' if leaks else 'PASS', 'filesScanned': scanned, 'liveCredentialSources': len(tokens), 'leakPaths': leaks,
          'limits': 'Exact current companion credentials only; no claim of exhaustive historical secret or visual OCR review.'}
pathlib.Path('artifacts').mkdir(exist_ok=True)
pathlib.Path('artifacts/secret-review.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
raise SystemExit(bool(leaks))
