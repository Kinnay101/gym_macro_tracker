"""Baut data/blv.json aus der Schweizer Nährwertdatenbank (BLV).

Quelle: https://naehrwertdaten.ch/de/downloads/ (kostenlos, Nutzung mit Quellenvermerk erlaubt,
ausdrücklich auch in Ernährungstagebuch-Apps).

Aufruf (beide Excel-Dateien vorher von der Seite herunterladen, deutsch und englisch):
    python tools/build_blv.py Schweizer_Nahrwertdatenbank.xlsx Swiss_food_composition_database.xlsx

Ergebnis: data/blv.json mit kompakten Zeilen
    [id, name_de, name_en, synonyme_de, kategorie (1 = generisch, 2 = Markenprodukt), kcal, p, c, f, fiber, sugar, salt]
Werte pro 100 g essbarer Anteil; fehlende Angaben ("k.A.") werden zu null.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from xlsx_read import read_sheet  # noqa: E402

# Spaltennamen in der deutschen Datei
COLS = {
    'kcal': 'Energie, Kilokalorien (kcal)',
    'p': 'Protein (g)',
    'c': 'Kohlenhydrate, verfügbar (g)',
    'f': 'Fett, total (g)',
    'fiber': 'Nahrungsfasern (g)',
    'sugar': 'Zucker (g)',
    'salt': 'Salz (NaCl) (g)',
}
ORDER = ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'salt']


def num(v, dec):
    if v is None or v in ('k.A.', '-', ''):
        return None
    try:
        x = round(float(v), dec)
    except ValueError:
        return None
    return int(x) if x == int(x) else x


def rows_of(path, sheet):
    rows = read_sheet(path, sheet)
    header_idx = next(i for i, r in enumerate(rows) if r and r[0] == 'ID')
    return rows[header_idx], [r for r in rows[header_idx + 1:] if r and r[0]]


def main(de_path, en_path):
    out = []
    version = read_sheet(de_path, 1)[0][0]
    for sheet, kind in ((1, 1), (2, 2)):
        header, rows = rows_of(de_path, sheet)
        _, rows_en = rows_of(en_path, sheet)
        en_names = {r[0]: r[3] for r in rows_en}
        idx = {k: header.index(name) for k, name in COLS.items()}
        for r in rows:
            vals = [num(r[idx[k]] if idx[k] < len(r) else None, 0 if k == 'kcal' else (2 if k == 'salt' else 1)) for k in ORDER]
            if vals[0] is None:
                continue
            syn = re.sub(r'\s+', ' ', r[4] or '').strip()
            out.append([r[0], r[3].strip(), (en_names.get(r[0]) or r[3]).strip(), syn, kind, *vals])
    os.makedirs('data', exist_ok=True)
    with open('data/blv.json', 'w', encoding='utf-8') as f:
        json.dump({'source': version, 'url': 'https://naehrwertdaten.ch', 'fields': ['id', 'de', 'en', 'syn', 'kind', *ORDER], 'rows': out},
                  f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} Lebensmittel geschrieben ({version})')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
