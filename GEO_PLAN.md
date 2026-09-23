# GEO — netpurple.net für KI-Suche sichtbar machen

## Ziel
Experiment: Wie weit kommt NetPurple in KI-Antworten (Google AI Overview, ChatGPT, Perplexity, Claude)
**nur durch Inhalt und Auslieferung auf der eigenen Seite** — ohne Backlinks/Reddit.
Realistische Ziele: Marken- und Nischenfragen sicher, Eigenschafts- und Einzel-Sound/-Spiel-Fragen
teilweise. Die generische Frage „beste Spiele-Websites" ist ohne Off-Page-Reputation nicht erreichbar.

## Ist-Zustand (Kernproblem)
KI-Crawler führen kein JS aus. Fast aller Inhalt wird aber per JS geladen:
- `/sound/` → `sounds.json` (208 Sounds) → `#soundGrid` ist im HTML leer.
- `/games/` → `games/config/games.json` (145 Spiele, nur `title`/`link`/`imgSrc`) → `#gameGrid` leer.
- `/tier/*`, `/tools/`, `/list/` → Appwrite, im HTML nur Überschrift / „Loading…".
- Startseite: kaum Text, Meta-Description nennt nur „anime ranking" (Series/Games-Tierlists fehlen).

## Grundprinzip
Ein lokales Node-Script **`tools/geo-gen/`** (Muster wie `tools/og-gen/`, keine npm-Deps, nur `node:fs`)
liest die Daten und schreibt statisches HTML ins Repo. Ergebnis wird **committet**, Deploy wie gehabt per
`git pull` auf dem VPS. Kein Build-Schritt beim Hosting, keine GitHub Action nötig.

- Generierter Inhalt steht in bestehenden Seiten zwischen Markern `<!-- geo:start -->` / `<!-- geo:end -->`,
  damit das Script idempotent ersetzen kann.
- Das JS rendert wie bisher darüber (ersetzt den statischen Inhalt im Grid) → für Nutzer ändert sich nichts.
- Script trägt neue Seiten in `sitemap.xml` ein und setzt `lastmod`.
- Aufruf: `node tools/geo-gen/generate.js [sounds|games|all]` — manuell nach Änderungen an den JSONs.

---

## Phase 0 — Baseline messen (vor jeder Änderung)
1. Fragenliste (~12) festlegen, je 3 pro Typ: Marke („Was ist NetPurple?"), Nische („Seite mit
   Browsergames, Soundboard und Anime-Tierlist"), Eigenschaften („Soundboard ohne Werbung mit Suche"),
   Einzel-Sound/-Spiel („bruh sound effect online", „2048 online spielen").
2. In Google AI Overview, ChatGPT (Suche an), Perplexity, Claude stellen; notieren: genannt ja/nein,
   Position, zitierte URL. Tabelle unten in dieser Datei führen.
3. Bing Webmaster Tools + Google Search Console prüfen/einrichten (ChatGPT sucht über den Bing-Index).

## Phase 1 — Sounds
1. **Statische Liste in `/sound/index.html`**: alle 208 Sounds als echte Elemente in `#soundGrid`
   (Name + Link auf die Einzelseite), vom Script zwischen den Markern erzeugt.
2. **Einzelseiten `/sound/<slug>/index.html`** (208 Stück): `<h1>` „<Name> Sound Effect", `<audio controls>`
   auf die MP3, 1–2 Sätze Text, Links zu 5 ähnlichen/zufälligen Sounds, `canonical`, OG-Tags.
   Slugs aus dem Namen, Kollisionen mit Suffix auflösen.
3. **Einleitungstext + FAQ** sichtbar auf `/sound/`: kostenlos, keine Werbung, keine Anmeldung,
   Suche, Queue/Play-All, Favoriten mit Account.
4. **JSON-LD**: `ItemList` der Sounds auf `/sound/`, `FAQPage` für die FAQ, `AudioObject` je Einzelseite.
5. Einzelseiten in `sitemap.xml`.
6. Prüfen: `curl https://netpurple.net/sound/` zeigt alle Sound-Namen im Roh-HTML; Rich Results Test grün.

## Phase 2 — Games
1. **Statische Liste in `/games/index.html`**: alle 145 Spiele als `<a>` mit Titel + Bild in `#gameGrid`.
2. **Beschreibungen beschaffen** (`games.json` hat keine): pro Spiel 1–2 Sätze + Steuerung.
   Quelle: `<meta description>` aus `games/projects/<x>/index.html` auf dem VPS auslesen, Rest
   KI-generiert und manuell geprüft. Ablage als neues Feld in `games.json` oder separate `games-meta.json`.
3. **Einzelseiten `/games/<slug>/index.html`** (145 Stück): `<h1>` „<Titel> — play free online",
   Bild, Beschreibung, Steuerung, großer „Play"-Button auf `projects/<x>/index.html`, ähnliche Spiele,
   `VideoGame`-JSON-LD, `canonical`.
4. **Einleitungstext + FAQ** auf `/games/`: 145 Spiele, kostenlos, keine Werbung, keine Anmeldung,
   Zufalls-Button, Favoriten, läuft auf Chromebook/Handy (vorher prüfen, was davon stimmt).
5. **JSON-LD**: `ItemList` + `FAQPage` auf `/games/`.
6. Entscheiden: `games/projects/*` (3kh0-Kopien, Duplicate Content) per `robots.txt` sperren oder
   `noindex`, damit die eigenen Einzelseiten statt der Kopien ranken.
7. Einzelseiten in `sitemap.xml`. Prüfen wie Phase 1.

## Phase 3 — Tierlists (später)
- Script liest die kuratierten Listen per Appwrite-REST (öffentlich, `read("any")`, kein Key — wie `og-gen`).
- Statisches Ranking pro Tier in `/tier/anime|series|games/`, fehlendes `<h1>` ergänzen,
  `ItemList`-JSON-LD mit Positionen.
- Hinweis: Nach jeder Listen-Änderung neu generieren (zusammen mit `og-gen`).

## Phase 4 — Rest
1. **Startseite**: neue Meta-Description/OG/JSON-LD (alle Bereiche + Zahlen), sichtbarer
   „Über NetPurple"-Absatz mit dem Kombinations-Satz, `sameAs` → GitHub, docu.netpurple.net.
2. **`/tools/` + `/list/`**: statisch aus Appwrite generieren (wie Phase 3), kurzer Einleitungstext.
3. **`/llms.txt`**: Kurzbeschreibung + Links auf alle Hauptbereiche.
4. **`robots.txt`**: KI-Bots (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended) bewusst erlauben.
5. **Sichtbares „Zuletzt aktualisiert"** auf den Hauptseiten, `sitemap.xml`-`lastmod` aktuell halten.
6. **IndexNow** an Bing pingen nach jedem Generator-Lauf (optional im Script).

## Nach jeder Phase
2–4 Wochen warten, Fragenliste aus Phase 0 erneut stellen, Ergebnisse unten eintragen.

## Messungen
| Datum | Phase | Frage | Google AIO | ChatGPT | Perplexity | Claude |
|---|---|---|---|---|---|---|
| | Baseline | | | | | |
