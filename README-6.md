# BLOCKSTORM

Block-Puzzle als installierbare PWA. Drei Modi, board-bewusste Teileauswahl, Chain-Combos, Pre-Clear-Glow und fünf Farbpaletten. Kein Build-Schritt, läuft direkt als statische Seite.

## Ordnerstruktur

```
index.html            Gerüst, alle Bildschirme, lädt die Module
style.css             Oberfläche
js/themes.js          Farbpaletten, setzt die CSS-Variablen
js/animations.js      Easing, Partikel, Banner, Screen-Shake, Sound, Block-Rendering
js/pieces.js          Formen und der Auswahl-Algorithmus
js/modes.js           Normal / Extreme (Overdrive) / Chaos
js/input.js           Ziehen mit dynamischem Finger-Offset
js/game.js            Board, Platzieren, Auflösen, Punkte, Rendering, Bedienung
manifest.json         PWA-Manifest
service-worker.js     Offline-Cache
icons/                App-Icons

blockstorm-standalone.html   Alles in einer Datei (CSS und JS eingebettet)
```

Die Einzeldatei ist zum Antippen ohne Server und für Vorschauen gedacht. Für die
Installation als App den Ordner nehmen — nur da funktionieren Manifest und
Offline-Cache. Beide Versionen sind inhaltlich identisch; die Einzeldatei wird
mit `build_standalone.py` aus dem Ordner erzeugt.

Lädt in dieser Reihenfolge, ohne Module-Imports — läuft dadurch auch per Doppelklick über `file://`, nicht nur über einen Server.

## Lokal testen

Doppelklick auf `index.html` reicht zum Spielen. Der Service Worker braucht allerdings `http`, also für einen echten Offline-Test:

```
python3 -m http.server 8000
```

und dann `http://localhost:8000` öffnen.

## Auf GitHub Pages bringen

1. Repository anlegen, z. B. `blockstorm`.
2. Den kompletten Ordner hochladen — `index.html` muss im Wurzelverzeichnis liegen, `js/` und `icons/` als Unterordner daneben.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save.
4. Nach ein bis zwei Minuten läuft es unter `https://<dein-name>.github.io/blockstorm/`.
5. Am Handy im Browser öffnen → Menü → *Zum Startbildschirm hinzufügen*.

Alle Pfade sind relativ, ein Unterordner funktioniert also genauso.

**Nach jedem Update** in `service-worker.js` die Zeile `const CACHE = "blockstorm-v4";` hochzählen. Ohne das liefert der Service Worker wochenlang die alte Version aus.

## Die drei Modi

| Modus | Punkte-Faktor | Besonderheit |
|---|---|---|
| Normal | ×1,0 | Klassisches 8×8 |
| Extreme | ×1,25 | Overdrive lässt das Feld wachsen |
| Chaos | ×1,5 | Zufallsereignisse alle paar Züge |

Jeder Modus hat eigenen Highscore und eigenen Spielstand.

### Extreme — Overdrive

Auslöser ist **drei Linien in einem Zug** oder eine **Serie von fünf**, danach drei Züge Sperre. Die Kamera zoomt heraus (Ease-out, 620 ms) und ein zwei Zellen breiter Ring legt sich um das Feld: 8×8 → 12×12 → 16×16 → 20×20, maximal drei Ringe.

Fällt eine Reihe oder Spalte, die **komplett im äußersten Ring** liegt (Index < 2 oder ≥ N−2), löst sich dieser Ring dauerhaft auf, die Blöcke darin zerplatzen und die Kamera fährt einen Schritt zurück. Ring für Ring, bis wieder nur das Kernfeld übrig ist.

Das mittlere 8×8 ist unzerstörbar — `Extreme.peel()` gibt bei N = 8 `null` zurück und rührt das Board nicht an. Solange Ringe offen sind, markiert eine gestrichelte goldene Linie den Kern.

### Chaos — Ereignisse

Alle drei bis acht Platzierungen, mit steigendem Score etwas häufiger, jeweils mit Ankündigungsbanner:

| Ereignis | Wirkung |
|---|---|
| Bombenlieferung | Nächstes Teil bringt eine Bombe mit |
| Wildcard | Ein Teil passt überall — auch über belegte Zellen |
| Board-Shuffle | Alle Blöcke werden neu verteilt, Anzahl bleibt gleich |
| Rainbow-Row | Eine Reihe zählt zehn Sekunden doppelt, mit Countdown-Balken |
| Frost | Eine Zelle ist drei Züge gesperrt und zählt nicht für Linien |
| Mystery-Block | Verwandelt sich beim Setzen in eine andere Form gleicher Größe |
| Double Trouble | Vier Teile statt drei im nächsten Satz |

## Teile-Auswahl

Keine neuen Formen — 38 Orientierungen wie gehabt. Geändert hat sich, wie gezogen wird:

1. Grundgewichte pro Form, abgesenkt für sperrige Teile je voller das Brett ist.
2. Pro Satz werden neun bis zwölf Kandidaten gewürfelt und bewertet: platzierbare Teile, Anzahl gültiger Positionen, Linienschluss-Potenzial, und ob eine Reihenfolge existiert, in der alle drei Platz finden (Tiefensuche mit simulierten Clears).
3. **Gewichtete Zufallsziehung** aus den besten vier — nicht einfach der Beste, damit es sich nicht berechnet anfühlt.
4. **Lückenhilfe**: steht eine Linie kurz vor dem Vollwerden, zählt Linienschluss-Potenzial fast doppelt.
5. **Wiederholungsschutz**: dieselbe Form kommt nicht dreimal hintereinander.
6. **Schwierigkeits-Skalierung**: mit Level und Serie mischen sich wieder mehr L-, Z- und Großformen rein — außer das Brett ist schon voll.
7. Gelegentlich (bis 26 %, nie über 48 % Belegung) ein bewusst sperriger Satz.

Gemessen über 260 Läufe pro Zeile:

| Belegung | | komplett spielbar | alle drei passen | Ø Positionen | Teile mit Clear | Game Over |
|---|---|---|---|---|---|---|
| 53 % | zufällig | 92 % | 82 % | 7,3 | 1,57 | 0 % |
| 53 % | **Generator** | **100 %** | **100 %** | **10,4** | **2,18** | 0 % |
| 66 % | zufällig | 84 % | 46 % | 4,3 | 1,97 | 2 % |
| 66 % | **Generator** | **99 %** | **91 %** | **6,8** | **2,63** | **0 %** |
| 75 % | zufällig | 88 % | 23 % | 2,8 | 1,73 | 10 % |
| 75 % | **Generator** | **100 %** | **71 %** | **4,4** | **2,68** | **0 %** |

## Punkte

| Ereignis | Wert |
|---|---|
| Block gesetzt | 2 pro Zelle |
| 1 Linie | 100 |
| 2 Linien | 300 |
| 3 Linien | 600 |
| 4 Linien | 1000 |
| jede weitere | +300 |
| aufgelöste Zelle | +5 |
| Perfect Clear | 1000 + Combo × 250 |

**Combo:** `1 + 0,3 pro Stufe`, gedeckelt bei ×6. Sie überlebt **zwei Züge ohne Auflösen** — erst der dritte setzt zurück. Die Punkte neben dem Balken zeigen, wie viel Luft noch bleibt.

**Chain-Wellen:** Sprengt ein Spezialblock weitere Spezialblöcke frei, zündet die nächste Welle mit ×1,5, ×2, ×2,5 …

Alles wird zusätzlich mit dem Modus-Faktor multipliziert.

## Perfect Clear

Ist das Feld komplett leer:

- großes Banner mit Bounce, Vollbild-Konfetti in den Theme-Farben, Screen-Flash, Sound, Vibration
- Bonus `(1000 + Combo × 250) × Modus-Faktor`
- **Combo reißt nicht ab**, sondern steigt um eine Stufe
- der nächste Teilesatz wird aus besonders gut passenden Kandidaten gezogen
- ein Hammer gratis
- in Extreme löst sich zusätzlich ein Ring auf
- in Chaos verschwinden alle Frost-Zellen und der Ereigniszähler startet neu
- Zähler wird dauerhaft gespeichert

## Ziehen

Das Teil schwebt über dem Finger. Der Abstand ist nicht fest, sondern hängt davon ab, wie weit oben der Finger steht:

```
t       = (Ablage-Oberkante − FingerY) / (Ablage-Oberkante − Feld-Oberkante)
offset  = (baseOffset + maxExtra × easeOutCubic(t)) × Zellgröße
```

Unten an der Ablage sind das knapp eine Zelle — das Teil klebt fast am Finger und reagiert direkt. Oben im Feld sind es gut drei Zellen, damit die Zielzelle nie unter dem Daumen verschwindet. Der Wert wird pro Frame weich nachgezogen, nie hart gesetzt. Erst ganz am Ende wird auf eine Rasterzelle gerundet — die sichtbare Bewegung bleibt also flüssig, das logische Ziel ist diskret.

Sitzt der Finger knapp daneben, rutscht das Teil auf die nächste gültige Position (Ring von einer Zelle, maximal ~1,4 Zellen Abstand). In den Optionen abschaltbar.

Konstanten stehen zentral in `js/input.js`:

```js
BS.DRAG_CFG = { baseOffset: 0.95, maxExtra: 2.15, followRate: 0.30, snapRadius: 2.1, liftScale: 1.06 }
```

Zum Nachjustieren am echten Gerät einfach diese Werte ändern.

## Pre-Clear-Glow

Schwebt ein Teil über einer gültigen Position, werden live die Reihen und Spalten berechnet, die dadurch komplett würden. Diese Linien bekommen ein helles, pulsierendes Leuchtband mit weißem Kern und farbigem Rand, die Blöcke darin werden zusätzlich aufgehellt, und entlang der Linie steigen Funken auf. Bewegt sich der Finger, verschwindet der Effekt sofort.

Beim tatsächlichen Auflösen wird das Leuchten nicht abgeschnitten, sondern übernommen und über `S.glow.a` ausgeblendet, während die Partikel starten — kein harter Schnitt.

## Darstellung und Farbwelten

Unter *Einstellungen* gibt es zwei Regler, die unabhängig voneinander wirken:

**Darstellung** — Hell, Dunkel oder Automatisch. Automatisch folgt der
Systemeinstellung des Handys und reagiert auch, wenn diese sich während des
Spiels ändert.

**Farbwelt** — sechs Sets, jedes davon in beiden Modi:

| Farbwelt | Charakter |
|---|---|
| Schiefer | Ruhig und neutral, gedeckt-kräftige Blöcke |
| Pastell | Rosa, Pfirsich, Butterblond, Minze, Himmelblau, Lavendel |
| Sonnenaufgang | Warme Rot-, Orange- und Bernsteintöne |
| Wald | Blattgrün, Limette, Senf, Rinde, Heide |
| Ozean | Himmel, Türkis, Marine, Sand, Koralle |
| Neon | Laut und leuchtend |

Die Blockfarben gehören zur Farbwelt, die Oberflächentöne zum Modus. Für den
Hellmodus werden die Blöcke automatisch etwas vertieft und gesättigt
(`shade()` und `sat()` in `js/themes.js`), damit sie auf hellem Grund genauso
satt wirken wie auf dunklem. Eine Form hat in jeder Farbwelt denselben
Farbplatz, nur andere Werte.

Die Vorschau in der Liste zeigt immer den gerade aktiven Modus — in Hell also
die hellen Werte auf hellem Grund.

Auch die Spielfläche zieht ihre Töne aus dem Theme: Rahmen, leere Zellen,
Textumriss, Geistervorschau, Blitz und Funken haben je Modus eigene Werte.
Es gibt keine hart codierten Farben mehr im Rendering.

## Daten

Alles im `localStorage` unter dem Präfix `blockstorm2.`:

- `best`, `games` — pro Modus
- `lines`, `perfect`, `bestStreak`, `bestChain`, `bestRings`
- `theme`, `themeMode`, `mode`, `o.*` (Einstellungen)
- `save.normal`, `save.extreme`, `save.chaos` — laufende Runden

Ist `localStorage` blockiert, läuft das Spiel trotzdem, nur ohne Speichern. Zurücksetzen über *Optionen → Alles zurücksetzen*.

## Anpassen

| Was | Wo |
|---|---|
| Farbwelten, Hell/Dunkel-Töne | `js/themes.js` |
| Formen und Grundgewichte | `SRC` in `js/pieces.js` |
| Auswahl-Strenge | `scoreSet()` und `deal()` in `js/pieces.js` |
| Overdrive-Auslöser | `Extreme.shouldExpand()` in `js/modes.js` |
| Chaos-Ereignisse | `EVENTS` in `js/modes.js` |
| Drag-Gefühl | `BS.DRAG_CFG` in `js/input.js` |
| Punkte und Combo | `lineBase()`, `streakMult()` in `js/game.js` |
| Klotz-Optik | `Render.paint()` in `js/animations.js` (`r` = Rundung, `b` = Fasenbreite) |
