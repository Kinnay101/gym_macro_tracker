# Android / Health Connect

Stand: 23.11.2026. Web-Seite: `js/healthConnect.js`, `js/views/healthConnectSetup.js`.
Android-Hülle: `android/app-shell` (Kotlin, WebView + Brücke `GymHC`), im Emulator (Android 17) getestet:
Rechte-Dialog, Lesen aller Datenarten, Mahlzeiten schreiben.

## Bauen und testen (Windows, ohne Android-Handy)
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android\app-shell; .\gradlew.bat assembleDebug
```
- Ausgabe liegt **nicht** in OneDrive, sondern unter `%LOCALAPPDATA%\gmt-android-build\app\outputs\apk\` (siehe `build.gradle.kts`).
- Emulator: `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Medium_Phone_API_37.0`
- Installieren + lokale Vorschau statt Online-Version (nur Debug-Build):
  `adb reverse tcp:8010 tcp:8010`, `adb install -r app-debug.apk`,
  `adb shell am start -S -n io.github.kinnay101.gymmacro/.MainActivity --es url "http://localhost:8010/#/body"`
- Nur im Debug-Build: Konsole der Web-Seite im Logcat (Tag `GymWeb`), WebView-DevTools, Brücken-Methoden
  `debugInsertTestData` (Beispielwerte nach Health Connect) und `debugReadNutrition` (geschriebene Mahlzeiten lesen).
- Release-Build (zum Verteilen) braucht einen eigenen Signier-Schlüssel – nie ins Repo (`*.jks` steht in `.gitignore`).

## Was ist Health Connect?
- Googles zentraler Gesundheitsspeicher auf dem Handy (das Gegenstück zu Apple Health). Ab Android 14 im System eingebaut,
  für Android 9–13 als App aus dem Play Store.
- Apps wie Samsung Health, Google Fit/Fitbit, Garmin, Withings, Strava oder MyFitnessPal schreiben hinein und lesen daraus.
- Die Daten liegen **nur auf dem Handy** – es gibt keine Web- oder Cloud-Schnittstelle. Lesen/schreiben kann nur eine
  installierte Android-App, und nur das, was die Person ihr pro Datenart erlaubt.
- Ohne Zusatzrecht liefert Health Connect nur Daten ab 30 Tage vor der ersten Freigabe.

## Welche Daten wir nutzen
| Health Connect | App | Recht (Manifest) |
|---|---|---|
| WeightRecord | Gewicht (`weights`, ♥) | `READ_WEIGHT` |
| BodyFatRecord | Körperfett | `READ_BODY_FAT` |
| StepsRecord (Tagessumme) | Schritte | `READ_STEPS` |
| ActiveCaloriesBurnedRecord (Tagessumme) | aktive kcal | `READ_ACTIVE_CALORIES_BURNED` |
| DistanceRecord (Tagessumme) | Distanz | `READ_DISTANCE` |
| ExerciseSessionRecord | Trainings + Trainingsminuten | `READ_EXERCISE` |
| HeartRateRecord (Ø pro Training) | Puls im Training | `READ_HEART_RATE` (optional) |
| SleepSessionRecord (+ Phasen) | Schlaf | `READ_SLEEP` |
| NutritionRecord | **schreiben:** Mahlzeiten | `WRITE_NUTRITION` |

Tagessummen immer über `aggregateGroupByPeriod` holen: Health Connect rechnet dabei Doppelte (Handy + Uhr) heraus.
Rohe Schritt-Einträge zusammenzählen würde doppelt zählen.

**Vorteil gegenüber dem iPhone:** Trainings sind lesbar (Art, Dauer, kcal, Distanz, Puls) – beim Kurzbefehl nicht.
Trainingsminuten pro Tag = Summe der Trainings (Android hat keinen „grünen Ring“).

## Nährwerte nach Health Connect – ja, aber abschaltbar
- Sinnvoll: Samsung Health, Fitbit/Google Fit usw. zeigen dann die Kalorienbilanz (gegessen vs. verbrannt) – wie Apple Health.
- Pro Tag und Mahlzeit **ein** `NutritionRecord` mit fester `clientRecordId` `gmt-<Datum>-<Mahlzeit>` → bei Änderungen
  wird ersetzt statt verdoppelt; leere Mahlzeit → Eintrag löschen. Die letzten 7 Tage werden nachgeführt.
- Felder: energy (kcal), protein, totalCarbohydrate, totalFat, dietaryFiber, sugar, sodium (= Salz / 2,5), name, mealType.
- In der App abschaltbar (Körper → Health Connect), Standard: an. Wer Essen zusätzlich in einer anderen App erfasst,
  sollte es ausschalten (sonst doppelt).

## Aufbau der Android-App
Eine kleine Kotlin-App ohne eigene Oberfläche: **eine WebView**, die https://kinnay101.github.io/gym_macro_tracker/ lädt.
Die Web-App bleibt die einzige App – Änderungen kommen weiter über GitHub Pages, ohne neue APK.

Brücke: `WebViewCompat.addWebMessageListener(webView, "GymHC", setOf("https://kinnay101.github.io"), listener)`
(androidx.webkit). Nur diese Adresse bekommt das Objekt `window.GymHC` – fremde Seiten in der WebView nicht.
Externe Links im Browser öffnen, nicht in der WebView.

Nachrichten (JSON-Text), genau beschrieben oben in `js/healthConnect.js`:
- `status()` → `{ available, needsUpdate, granted: ['read_steps', …, 'write_nutrition'] }` (`HealthConnectClient.getSdkStatus`)
- `requestPermissions()` → öffnet den Health-Connect-Dialog (`PermissionController.createRequestPermissionResultContract()`)
- `read({ from, to })` → `{ days, weights, bodyFat, exercise, sleep }` (Format siehe `fromHealthConnect()`), Typnamen über
  `ExerciseSessionRecord.EXERCISE_TYPE_INT_TO_STRING_MAP` bzw. `SleepSessionRecord.STAGE_TYPE_INT_TO_STRING_MAP`
- `writeNutrition({ upsert, remove })` → `insertRecords(...)` mit `clientRecordId` + `clientRecordVersion` (z. B. Zeitstempel),
  `deleteRecords(NutritionRecord::class, emptyList(), remove)`
- `openSettings()` → Health-Connect-Einstellungen bzw. Play Store, falls nicht installiert

Pflicht im Manifest (sonst zeigt Health Connect keinen Dialog):
- die `uses-permission`-Zeilen aus der Tabelle oben
- `<queries><package android:name="com.google.android.apps.healthdata" /></queries>`
- eine Aktivität mit Datenschutz-Erklärung: Intent-Filter `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (bis Android 13)
  und ein `activity-alias` mit `android.intent.action.VIEW_PERMISSION_USAGE` + Kategorie
  `android.intent.category.HEALTH_PERMISSIONS` (ab Android 14). Kann einfach die Datenschutz-Seite in der WebView zeigen.

Abgleich: beim Öffnen und beim Zurückkehren in die App (höchstens alle 15 Min.) – erledigt die Web-Seite.
Später möglich: täglicher Hintergrund-Abgleich (WorkManager), braucht das Zusatzrecht für Lesen im Hintergrund.

## Testen ohne Android-Handy
- Android Studio (Windows, gratis) installieren. Der Emulator mit einem Android-14/15-Abbild hat Health Connect eingebaut.
- Testdaten: im Emulator von Hand in Health Connect eintragen oder mit Googles Entwickler-App „Health Connect Toolbox“.
- Web-Seite ohne Emulator testen: in der Browser-Konsole eine nachgebaute Brücke `window.GymHC` setzen (so wurde
  `js/healthConnect.js` getestet).

## Verteilen an Freunde
- Einfach: APK direkt schicken, Freunde erlauben „Unbekannte Apps installieren“. Gratis, aber Updates der Hülle von Hand
  (selten nötig, weil die Web-App online aktualisiert wird).
- Play Store: einmalig 25 USD Entwicklerkonto; Apps mit Health-Connect-Rechten brauchen zusätzlich eine Freigabe von Google
  (Formular zur Datennutzung + Datenschutzerklärung). Für einen kleinen Freundeskreis eher „Interner Test“.

## Erkenntnisse aus dem Test
- Health Connect lehnt Zeitpunkte in der Zukunft ab → Mahlzeiten von heute, deren Standardzeit (z. B. 19:00) noch nicht
  erreicht ist, werden auf „jetzt“ vorgezogen.
- kcal/Distanz pro Training = Anteil der Tageswerte im Zeitfenster des Trainings (Health Connect teilt längere Einträge
  anteilig auf). Mit Uhr-Daten (minütlich) stimmt das gut, mit groben Einträgen nur ungefähr.
- Seite lädt beim allerersten Start ein paar Sekunden (danach aus dem Zwischenspeicher).

## Offen
- Release-Build mit Signier-Schlüssel, Verteilung (APK direkt oder Play Store mit Health-Freigabe).
- Datenschutzerklärung als Web-Seite (für den Play Store nötig; in der App gibt es sie schon).
- Export als Datei (Blob-Download) geht in der WebView noch nicht.
- Abgleich im Hintergrund (morgens automatisch) – bisher nur beim Öffnen der App.
- Test mit echtem Android-Handy und echter Uhr.
