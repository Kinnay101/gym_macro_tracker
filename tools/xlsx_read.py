"""Minimaler XLSX-Leser ohne Zusatzpakete (nur Python-Standardbibliothek)."""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def _col(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_sheet(path, index):
    """Liefert die Zeilen des Blatts Nr. index (1-basiert) als Listen von Strings/None."""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    root = ET.fromstring(z.read(f'xl/worksheets/sheet{index}.xml'))
    rows = []
    for row in root.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            v = c.find('m:v', NS)
            typ = c.get('t')
            if typ == 'inlineStr':
                val = ''.join(t.text or '' for t in c.iter('{%s}t' % NS['m']))
            elif v is None:
                val = None
            elif typ == 's':
                val = shared[int(v.text)]
            else:
                val = v.text
            cells[_col(c.get('r'))] = val
        width = max(cells) + 1 if cells else 0
        rows.append([cells.get(i) for i in range(width)])
    return rows
