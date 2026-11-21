"""Fremd-Dateien (Bibliotheken, KI-Modelle) geprüft ins Projekt holen – und später nachprüfen.

Grundsätze (siehe CLAUDE.md / vendor/README.md):
  * Nur von der offiziellen Quelle laden und gegen deren Prüfsumme prüfen
      - npm:          sha512 des Paket-Archivs aus der Registry
      - Hugging Face: sha256 der LFS-Datei, fest auf einen Commit gepinnt
  * npm-Versionen sollen mindestens 14 Tage alt sein (Schutz vor frisch manipulierten Paketen)
  * Dateien über 90 MB werden in Teile zerlegt (GitHub nimmt nur bis 100 MB); die App setzt sie
    in js/ai.js (splitAwareFetch) wieder zusammen und prüft die Gesamt-sha256.
  * Jede Datei wird mit Herkunft und sha256 in vendor/SOURCES.json eingetragen.
  * Lizenz VOR dem Herunterladen prüfen (nur MIT/Apache/BSD o. ä.; nicht "research only").

Aufruf (im Projektordner, Python ohne Zusatzpakete):
  python -I tools/fetch_vendor.py npm  <paket> <version> <datei-im-paket>=<ziel> [...]
  python -I tools/fetch_vendor.py hf   <repo> <datei> [<datei> ...] [--rev <commit-sha>]
  python -I tools/fetch_vendor.py info <repo>          # Lizenz, Commit, Dateien + Größen anzeigen
  python -I tools/fetch_vendor.py verify               # alle Einträge in SOURCES.json nachprüfen

Beispiele:
  python -I tools/fetch_vendor.py npm @huggingface/transformers 4.3.2 dist/transformers.min.js=vendor/transformers/transformers.min.js
  python -I tools/fetch_vendor.py hf briaai/RMBG-1.4 config.json preprocessor_config.json onnx/model_quantized.onnx
"""
import base64
import datetime
import hashlib
import io
import json
import os
import sys
import tarfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, 'vendor', 'SOURCES.json')
SPLIT_AT = 90_000_000
MIN_AGE_DAYS = 14


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'gym-tracker-fetch'})
    with urllib.request.urlopen(req) as r:
        return r.read()


def load_sources():
    if not os.path.exists(SOURCES):
        return []
    raw = open(SOURCES, 'rb').read()
    try:
        return json.loads(raw.decode('utf-8'))
    except UnicodeDecodeError:  # ältere Fassung war in Windows-Kodierung gespeichert
        return json.loads(raw.decode('cp1252'))


def save_sources(entries):
    entries.sort(key=lambda e: e['file'])
    with open(SOURCES, 'w', encoding='utf-8') as f:
        f.write(json.dumps(entries, indent=1, ensure_ascii=False))


def record(entries, path, data, source):
    rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
    entries[:] = [e for e in entries if e['file'] != rel]
    entries.append(dict(file=rel, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), source=source))
    print(f'{len(data) / 1e6:8.1f} MB  {rel}')


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def cmd_npm(args):
    if len(args) < 3:
        sys.exit('Aufruf: npm <paket> <version> <datei-im-paket>=<ziel> [...]')
    pkg, ver, mappings = args[0], args[1], args[2:]
    meta = json.loads(get(f'https://registry.npmjs.org/{pkg}'))
    published = meta['time'][ver]
    age = (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(published.replace('Z', '+00:00'))).days
    print(f'{pkg}@{ver}: veröffentlicht {published[:10]} ({age} Tage), Lizenz {meta["versions"][ver].get("license")}')
    if age < MIN_AGE_DAYS and '--force' not in sys.argv:
        sys.exit(f'Abbruch: Version ist jünger als {MIN_AGE_DAYS} Tage (mit --force trotzdem laden).')
    dist = meta['versions'][ver]['dist']
    tgz = get(dist['tarball'])
    algo, b64 = dist['integrity'].split('-', 1)
    if algo != 'sha512' or base64.b64encode(hashlib.sha512(tgz).digest()).decode() != b64:
        sys.exit('Abbruch: Prüfsumme des Pakets stimmt nicht!')
    tar = tarfile.open(fileobj=io.BytesIO(tgz))
    entries = load_sources()
    for m in mappings:
        if m.startswith('--'):
            continue
        src, dst = m.split('=', 1)
        data = tar.extractfile('package/' + src).read()
        path = os.path.join(ROOT, dst)
        write(path, data)
        record(entries, path, data, f'npm {pkg}@{ver} ({src}), Paket-sha512 geprüft, veröffentlicht {published[:10]}')
    save_sources(entries)


def hf_tree(repo, rev):
    files = {}
    for sub in ['', '/onnx']:
        try:
            for f in json.loads(get(f'https://huggingface.co/api/models/{repo}/tree/{rev}{sub}')):
                if f.get('type') == 'file':
                    files[f['path']] = f
        except Exception:
            pass
    return files


def cmd_info(args):
    repo = args[0]
    info = json.loads(get(f'https://huggingface.co/api/models/{repo}'))
    card = info.get('cardData') or {}
    print(f'{repo}\n  Commit:  {info["sha"]}\n  Lizenz:  {card.get("license")} {card.get("license_name") or ""} {card.get("license_link") or ""}')
    print(f'  Gated:   {info.get("gated")}\n  Basis:   {card.get("base_model")}')
    for path, f in sorted(hf_tree(repo, info['sha']).items()):
        print(f'  {f.get("size", 0) / 1e6:8.1f} MB  {path}')


def cmd_hf(args):
    rev = None
    if '--rev' in args:
        i = args.index('--rev')
        rev = args[i + 1]
        args = args[:i] + args[i + 2:]
    repo, files = args[0], [a for a in args[1:] if not a.startswith('--')]
    info = json.loads(get(f'https://huggingface.co/api/models/{repo}'))
    rev = rev or info['sha']
    card = info.get('cardData') or {}
    print(f'{repo} @ {rev[:12]} – Lizenz laut Modellkarte: {card.get("license")} {card.get("license_name") or ""}')
    tree = hf_tree(repo, rev)
    entries = load_sources()
    for name in files:
        if name not in tree:
            sys.exit(f'Abbruch: {name} gibt es in {repo} @ {rev[:12]} nicht.')
        data = get(f'https://huggingface.co/{repo}/resolve/{rev}/{name}')
        digest = hashlib.sha256(data).hexdigest()
        lfs = tree[name].get('lfs')
        if lfs and lfs['oid'] != digest:
            sys.exit(f'Abbruch: Prüfsumme von {name} stimmt nicht!')
        source = f'huggingface.co/{repo} @ {rev[:12]}' + (', LFS-sha256 geprüft' if lfs else '') + f', Lizenz {card.get("license")}'
        path = os.path.join(ROOT, 'models', repo, name)
        if len(data) <= SPLIT_AT:
            write(path, data)
            record(entries, path, data, source)
            continue
        # Zu groß für GitHub: in Teile zerlegen + Manifest
        parts = []
        for n, start in enumerate(range(0, len(data), SPLIT_AT), 1):
            part = data[start:start + SPLIT_AT]
            part_name = f'{os.path.basename(name)}.part{n}'
            write(os.path.join(os.path.dirname(path), part_name), part)
            parts.append(part_name)
            record(entries, os.path.join(os.path.dirname(path), part_name), part,
                   f'Teil {n} der Datei {name} (Gesamt-sha256 {digest}); {source}')
        manifest = json.dumps({'size': len(data), 'sha256': digest, 'parts': parts}).encode()
        write(path + '.parts.json', manifest)
        record(entries, path + '.parts.json', manifest, f'Manifest für {name} (selbst erzeugt)')
        if os.path.exists(path):
            os.remove(path)
    save_sources(entries)


def cmd_verify(_args):
    entries, bad = load_sources(), 0
    for e in entries:
        path = os.path.join(ROOT, e['file'])
        if not os.path.exists(path):
            print(f'FEHLT     {e["file"]}')
            bad += 1
            continue
        digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
        if digest != e['sha256']:
            print(f'GEÄNDERT  {e["file"]}')
            bad += 1
    print(f'{len(entries)} Dateien geprüft, {bad} Problem(e).')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')  # Umlaute auch in der Windows-Konsole
    sys.stderr.reconfigure(encoding='utf-8')
    commands = {'npm': cmd_npm, 'hf': cmd_hf, 'info': cmd_info, 'verify': cmd_verify}
    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]](sys.argv[2:])
