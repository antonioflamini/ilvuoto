# IL VUOTO · La Stanza

La pagina-compagna dei libri *IL VUOTO* di Antonio Flamini: la Stanza, il Test del Silenzio, la domanda di Oggi con **Il tuo Vuoto** (150 pagine scritte da te), Cancella, i Giochi e Passa.

Sito: https://antonioflamini.github.io/ilvuoto/ — English: https://antonioflamini.github.io/ilvuoto/en/

## Dove sono le cose
- `testi.js` — **tutte le parole**: domande del giorno, Test, volumi e frammenti, temi della Stanza, esercizi, frasi dell'autore, vendite. Si modifica liberamente (attenzione a virgolette e virgole).
- `app.js` — il motore (non serve toccarlo per cambiare i testi)
- `index.html` — la struttura della pagina
- `stile.css` — l'aspetto; `fonts/` — Jost e IBM Plex Mono (licenza OFL)
- `sw.js` — funzionamento offline. **Se lo modifichi, alza il numero della cache** (`ilvuoto-vN`)
- `en/` — versione inglese (copia tradotta di `testi.js`, `app.js`, `index.html`: le modifiche vanno riportate anche lì)
- `og.jpg` — anteprima dei link; `libro.jpg` — foto del Volume I
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`, `icon.svg` — installazione come app
- `tools/build_claude.py` — prepara la versione per l'artifact su claude.ai (cartella `../build-claude/`)

## Statistiche
GoatCounter, account `ilvuoto-stanza` (https://ilvuoto-stanza.goatcounter.com), costante `GOATCOUNTER` in `app.js`.
Per il numero «oggi hanno risposto N persone» va attivato in GoatCounter: *Settings → Allow adding visitor counts on your website*.

## Privacy
Niente account, niente cookie. Le risposte di Oggi e Il tuo Vuoto restano nel browser di chi le scrive.
