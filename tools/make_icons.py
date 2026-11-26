"""Erzeugt die App-Icons als PNG (fürs iPhone nötig, Safari nimmt kein SVG als Home-Bildschirm-Icon).

Gleiches Motiv wie icons/icon.svg (Hantel), aber randlos quadratisch – iOS und Android runden die Ecken selbst.
Nur Python-Standardbibliothek. Aufruf: python -I tools/make_icons.py
"""
import math
import os
import struct
import zlib

BG = (0x12, 0x11, 0x10)
FG = (0xFF, 0x7A, 0x3D)
# Linien im 512er-Raster wie in icon.svg, Strichbreite 40, runde Enden
SEGMENTS = [((156, 176), (156, 336)), ((356, 176), (356, 336)), ((96, 224), (96, 288)),
            ((416, 224), (416, 288)), ((156, 256), (356, 256))]
HALF = 20


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def render(size, scale_motif=1.0):
    k = 512 / size
    rows = []
    for y in range(size):
        row = bytearray([0])  # Filter-Byte
        for x in range(size):
            # Pixelmitte im 512er-Raster; Motiv um die Mitte skaliert (für "maskable" etwas kleiner)
            px = 256 + ((x + 0.5) * k - 256) / scale_motif
            py = 256 + ((y + 0.5) * k - 256) / scale_motif
            d = min(seg_dist(px, py, a, b) for a, b in SEGMENTS) - HALF
            cov = max(0.0, min(1.0, 0.5 - d * scale_motif / k))  # Kantenglättung über 1 Pixel
            row += bytes(round(BG[i] + (FG[i] - BG[i]) * cov) for i in range(3))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
    for name, size, s in [('icon-180.png', 180, 1.0), ('icon-192.png', 192, 1.0), ('icon-512.png', 512, 1.0), ('icon-maskable-512.png', 512, 0.8)]:
        with open(os.path.join(root, name), 'wb') as f:
            f.write(render(size, s))
        print('geschrieben:', name)
