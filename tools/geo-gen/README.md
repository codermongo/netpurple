# GEO generator — statisches HTML für Crawler

Suchmaschinen- und KI-Crawler (GPTBot, ClaudeBot, PerplexityBot, …) führen meist
kein JS aus. Die Seiten rendern ihre Listen aber per JS aus JSON. Dieses Skript
schreibt denselben Inhalt zusätzlich als statisches HTML ins Repo. Siehe `plan/GEO_PLAN.md` (lokal, nicht im Repo).

## Nutzung

```bash
cd tools/geo-gen
node generate.js            # alles
node generate.js sounds     # nur ein Ziel
```

Keine npm-Dependencies. Output **wird committet**, danach normal deployen
(`git pull` auf dem Server).

## Wann neu erzeugen

Nach jeder Änderung an `sound/sounds.json`, `games/config/games.json` oder an
einer eigenen CSS-/JS-Datei. Kein Cron, bewusst manuell, wie `og-gen`.

## Was geschrieben wird

| Ziel | Dateien |
|---|---|
| `sounds` | `sound/index.html` (zwischen `<!-- geo:jsonld -->`, `<!-- geo:list -->`, `<!-- geo:about -->`), `sound/<slug>/index.html` je Sound, `sitemap.xml` (zwischen `<!-- geo:sound -->`) |
| `games` | `games/index.html` (dieselben Marker), `games/<slug>/index.html` **nur für Spiele mit `description`** in `games/config/games.json`, `sitemap.xml` (zwischen `<!-- geo:games -->`) |

| `assets` | **alle** HTML-Seiten im Repo: hängt an jede lokale `.css`/`.js`-Einbindung `?v=<hash>` (Hash des Dateiinhalts). Läuft bei jedem Aufruf automatisch als letztes Ziel mit. |

## Cache-Busting (Cloudflare)

Cloudflare cached CSS/JS 4 Stunden. Ohne neue URL sehen Besucher nach einem
Deploy noch die alte Datei. Deshalb: **nach jeder Änderung an CSS/JS
`node generate.js` laufen lassen**, dann bekommt die Datei eine neue
`?v=`-Nummer und wird sofort neu geladen. Der Hash wird mit LF-Zeilenenden
berechnet, ist also auf Windows und Linux gleich.

## Beschreibungen

Beschreibungen stammen aus den `<meta description>` der Spiele auf dem Server
(`games/projects/*/index.html`). Neue Beschreibung = Feld `description` in
`games.json` ergänzen, Skript neu laufen lassen.

- Nur der Inhalt **zwischen** den Markern wird ersetzt, der Rest der Seite bleibt Handarbeit.
- Das JS der Seite ersetzt die statische Liste beim Laden wie bisher, für Nutzer ändert sich nichts.
- Einzelseiten tragen `<meta name="generator" content="netpurple-geo-gen">`. Ordner mit
  diesem Marker, deren Sound nicht mehr existiert, werden beim nächsten Lauf gelöscht.
  Andere Ordner (`css/`, `img/`, `sounds/`, `config/`, `js/`, `projects/`) werden nie angefasst.
- `lastmod` in der Sitemap = Datum des letzten Commits der JSON-Datei (heute, wenn sie uncommittete Änderungen hat).
