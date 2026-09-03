# OG image generator — kuratierte Tierlists

Erzeugt die statischen Social-Preview-Bilder für `/tier/anime|games|series/`.
Social-Crawler (Discord, WhatsApp, X, Telegram, …) führen kein JS aus, sehen also
nur die statischen `<meta>`-Tags. Diese zeigen auf `tier/<cat>/og.png` — dieses
Skript rendert diese PNGs.

## Nutzung

```bash
cd tools/og-gen
npm install          # einmalig (node_modules ist gitignored)
node generate.js             # alle drei Listen
node generate.js games       # nur eine
```

Output: `tier/<cat>/og.png` (1200×630), **wird committet**. Danach normal
deployen (`git pull` auf dem Server).

## Wann neu erzeugen

Nach spürbaren Änderungen an einer kuratierten Liste (neue Einträge, Tier-
Verschiebungen). Kein Cron, kein Server-Job — bewusst manuell gehalten.

## Wie es funktioniert

- Liest die Listen per Appwrite-REST aus denselben öffentlichen Collections wie
  die Seite (`read("any")`, kein Key).
- Gruppiert nach Tier (`Best of All Time → S … F → -F`), sortiert je Tier nach
  `tier_position`.
- Layout via **satori** (HTML/CSS → SVG), Rasterung via **@resvg/resvg-js**.
  Kein Headless-Browser.
- Cover werden von ihren `cover_url` geladen und als Data-URI eingebettet; fehlt
  eine, kommt ein Initialen-Platzhalter.
- Zeigt so viele Tiers, wie bei lesbarer Cover-Größe passen; der Rest steht als
  `+ D · E · F` unter den Reihen. Volle Reihen brechen bei `+N` um.

Fonts: `@fontsource/inter` (OFL), aus `node_modules` gelesen.
