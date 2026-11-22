# Fremd-Dateien

Alles hier stammt aus offiziellen Quellen und wurde mit `tools/fetch_vendor.py` geladen (Prüfsumme kontrolliert, Eintrag in `SOURCES.json`). Nicht von Hand ändern.

| Ordner | Paket | Lizenz | Zweck |
|---|---|---|---|
| `zxing/` | zxing-wasm 3.1.6 (npm) | MIT (zxing-cpp: Apache-2.0) | Barcode-Scanner, falls der Browser keinen eigenen hat (z. B. iPhone) |
| `supabase/` | @supabase/supabase-js 2.119.0 (npm, UMD) | MIT | Konto und Sync (gleiche Version wie Kleiderschrank) |

Nachprüfen: `python -I tools/fetch_vendor.py verify`

# Daten (`data/`)

| Datei | Quelle | Nutzung |
|---|---|---|
| `blv.json` | Schweizer Nährwertdatenbank V 7.1, BLV (naehrwertdaten.ch), erzeugt mit `tools/build_blv.py` | Kostenlos, Quellenvermerk nötig (steht in der App) |

Open Food Facts wird zur Laufzeit abgefragt (Daten unter ODbL, Hinweis steht in der App).
