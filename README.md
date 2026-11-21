# Gym Macro Tracker

Training und Ernährung tracken – als Web-App (PWA) fürs Handy, für mich und ein paar Freunde.

- **Training:** Trainingsplan mit flexiblem Rhythmus (verpasste Trainings warten, die Pause rückt nach), Sätze abhaken, Varianten, Aufwärmsätze, Bestwerte (geschätztes 1RM), Cardio.
- **Ernährung:** Kalorien, Protein, Kohlenhydrate, Fett, Ballaststoffe, Zucker, Salz – nach Mahlzeiten. Suche in der Schweizer Nährwertdatenbank, Markenprodukte über Open Food Facts, Barcode-Scanner, eigene Lebensmittel.
- **Körper:** Gewicht, Masse, automatisch berechnetes Tagesziel.
- **Privat:** Daten bleiben vorerst im Browser des Geräts (Export/Import als Datei).

## Auf dem iPhone installieren
Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Lokal starten
```
python -m http.server 8010
```
→ http://localhost:8010

## Datenquellen und Fremd-Software
- [Schweizer Nährwertdatenbank](https://naehrwertdaten.ch) des Bundesamts für Lebensmittelsicherheit und Veterinärwesen (BLV), Version 7.1 – Nutzung mit Quellenvermerk erlaubt
- [Open Food Facts](https://world.openfoodfacts.org) – Daten unter [ODbL](https://opendatacommons.org/licenses/odbl/1-0/)
- [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) – MIT (Barcode-Scanner), basiert auf [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) – Apache-2.0

Herkunft und Prüfsummen: [vendor/README.md](vendor/README.md).

Diese App ist ein privates, nicht-kommerzielles Projekt.
