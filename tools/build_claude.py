"""Costruisce la versione per l'artifact su claude.ai a partire dai file del sito.

Uso:  python tools/build_claude.py
Crea la cartella build-claude/ (fuori dal sito pubblicato) con index.html e i file da pubblicare.
Su claude.ai: niente service worker, manifest, icone, statistiche e link alla versione inglese;
la voce viva (window.claude) e i download funzionano lì da soli, il resto del codice è lo stesso.
"""
import os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), "build-claude")

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
head_end = html.index("</head>")
head, body = html[:head_end], html[head_end:]

keep = []
for line in head.split("\n"):
    if re.search(r'rel="(manifest|icon|apple-touch-icon|canonical|alternate)"|og:|twitter:|theme-color|apple-mobile-web-app|mobile-web-app-capable|application/ld\+json', line):
        continue
    keep.append(line)
head = "\n".join(keep)
head = head.replace("<title>", '<meta name="claude:viewport-fit-sides" content="cover">\n<title>', 1)
body = re.sub(r'\s*<a class="buy" href="en/"[^>]*>English</a>', "", body)
head, body = re.sub(r'\?v=[\w.-]+"', '"', head), re.sub(r'\?v=[\w.-]+"', '"', body)   # su claude.ai i file sono già versionati

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="").write(head + body)
files = ["stile.css", "testi.js", "app.js", "libro.jpg"] + ["fonts/" + f for f in os.listdir(os.path.join(ROOT, "fonts")) if f.endswith(".woff2")]
for f in files:
    os.makedirs(os.path.dirname(os.path.join(OUT, f)) or OUT, exist_ok=True)
    shutil.copyfile(os.path.join(ROOT, f), os.path.join(OUT, f))
print(OUT); print("\n".join(files))
