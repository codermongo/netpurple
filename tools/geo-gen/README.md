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

Nach jeder Änderung an `sound/sounds.json`. Kein Cron, bewusst manuell, wie `og-gen`.

## Was geschrieben wird

| Ziel | Dateien |
|---|---|
| `sounds` | `sound/index.html` (zwischen `<!-- geo:jsonld -->`, `<!-- geo:list -->`, `<!-- geo:about -->`), `sound/<slug>/index.html` je Sound, `sitemap.xml` (zwischen `<!-- geo:sound -->`) |

- Nur der Inhalt **zwischen** den Markern wird ersetzt, der Rest der Seite bleibt Handarbeit.
- Das JS der Seite ersetzt die statische Liste beim Laden wie bisher, für Nutzer ändert sich nichts.
- Einzelseiten tragen `<meta name="generator" content="netpurple-geo-gen">`. Ordner mit
  diesem Marker, deren Sound nicht mehr existiert, werden beim nächsten Lauf gelöscht.
  Andere Ordner (`css/`, `img/`, `sounds/`) werden nie angefasst.
- `lastmod` in der Sitemap = Datum des letzten Commits von `sounds.json`.
