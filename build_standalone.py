# Baut aus der Modulstruktur eine einzelne HTML-Datei.
# Praktisch zum Antippen ohne Server und für die Vorschau.
import re, io

html = open("index.html", encoding="utf-8").read()
css = open("style.css", encoding="utf-8").read()

html = html.replace('<link rel="stylesheet" href="./style.css">',
                    "<style>\n" + css + "\n</style>")

# Externe PWA-Verweise raus, die gibt es in der Einzeldatei nicht
html = html.replace('<link rel="manifest" href="./manifest.json">\n', "")
html = html.replace('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">\n', "")
html = html.replace('<link rel="icon" href="./icons/icon-192.png">\n', "")

for name in ["themes", "animations", "pieces", "modes", "input", "game"]:
    tag = '<script src="./js/%s.js"></script>' % name
    src = open("js/%s.js" % name, encoding="utf-8").read()
    html = html.replace(tag, "<script>\n/* ---- js/%s.js ---- */\n%s\n</script>" % (name, src))

# Service-Worker-Registrierung in der Einzeldatei abschalten
html = html.replace('if ("serviceWorker" in navigator) {', 'if (false) {')

html = html.replace("<title>BLOCKSTORM</title>",
                    "<title>BLOCKSTORM</title>\n<!-- Einzeldatei-Version: CSS und JS sind eingebettet. "
                    "Fuer die PWA-Installation die Ordnerversion nutzen. -->")

open("blockstorm-standalone.html", "w", encoding="utf-8").write(html)
print("blockstorm-standalone.html:", len(html), "Zeichen")
