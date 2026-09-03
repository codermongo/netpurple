# Custom Tierlists — offene Punkte & Notizen

Ergänzt `TIERLIST_PLAN.md` (der grosse Plan). Hier: nachträglich aufgefallene
Lücken und kleinere To-dos, die noch nicht angegangen sind.

---

## Discoverability: `/tier/me/` hat keinen Einstieg

**Stand 2026-09-03.** Die Seite „Meine Listen" (`/tier/me/`) ist praktisch verwaist.
Grep über das ganze Repo: `/tier/me` taucht nur 3× auf — Login-Return-Konstante
in `tier/create.js:22`, der Zurück-Pfeil in `tier/custom/index.html:37`, und der
eigene Login-Gate-Redirect in `tier/me/index.html:164`. **Kein regulärer
Navigations-Link.**

Aktuelle Wege dorthin:
1. URL direkt eintippen.
2. Zurück-Pfeil (Kreis-Button oben links) im Custom-Editor `/tier/custom/?id=…`
   → `/tier/me`. Setzt voraus, dass man schon im Editor ist.
3. Nach dem Erstellen über die 4. Karte auf `/tier/` landet man auf
   `/tier/custom/?id=<neu>` (leerer Editor), **nicht** auf `/tier/me`.
4. Login-Redirect: nicht eingeloggt + Erstell-Flow angestossen →
   `/login?return=/tier/me` → nach Login auf `/tier/me`.

**Erledigt 2026-09-03:**
- `/tier/` Hero: Button „Meine Listen" (`.tool-button.secondary`) im vorher leeren
  `.hero-buttons`.
- `/tier/`, `/tier/anime|games|series/`: Kreis-Button (Listen-Icon) in der
  `.theme-toggle-container` neben dem Zurück-Pfeil → `/tier/me`.
- Immer sichtbar (nicht auth-gated); `/tier/me` gated selbst und leitet ggf. auf
  `/login?return=/tier/me`.

Noch offen (bewusst nicht gemacht):
- Nach dem Erstellen landet man weiter direkt im Editor (`/tier/custom?id=`), nicht
  auf `/tier/me` — so gewollt laut Plan (F3).
- Homepage-Karte „Tierlist" hat keinen Sekundär-Link zu „Meine Listen".

---

## OG-/Share-Vorschaubild — kuratierte Listen: erledigt

Stand 2026-09-03. Beim Teilen von `/tier/anime|games|series/` erscheint jetzt ein
gerendertes Bild der Liste (Cover nach Tiers, NetPurple-Dark, 1200×630).

- Generator: `tools/og-gen/` (satori + resvg, kein Headless-Browser, kein
  VPS-Dienst). `node generate.js` liest die öffentlichen Appwrite-Collections und
  schreibt `tier/<cat>/og.png` (committet). Neu erzeugen bei spürbaren Listen-
  Änderungen — manuell, kein Cron.
- Meta in den 3 `index.html`: `og:image`/`twitter:image` → die PNGs,
  `og:image:width/height/alt` ergänzt.
### Erledigt 2026-09-03: tote SEO-Domain sitewide auf `netpurple.net`
`www.netpurple.com` / `netpurple.com` lösten **nicht auf** (nur `netpurple.net`
lebt). Alle `https://www.netpurple.com/…` in `index.html`, `sitemap.xml`,
`robots.txt`, `games/`, `list/`, `login/`, `sound/`, `tier/`, `tools/` und den
JSON-LD-Blöcken auf `https://netpurple.net/…` umgestellt (ohne `www`, da
`www.netpurple.net` per 301 auf die Apex zeigt). `logo.png` liegt im Repo-Root,
die generischen `og:image=…/logo.png` funktionieren damit jetzt.

### Offen: User-Listen (`/tier/custom/?id=…`)
Für die kann man keine PNGs vorbacken (unbegrenzt, pro User). Wenn die teilbar
werden sollen → Live-OG-Endpoint (Vorschlag C: kleiner Node-Container wie
`speed-auth`, rendert `/tier/s/<id>/og` + eine `/tier/s/<id>`-Share-Seite mit
`og:title` = Listenname). Noch nicht gebaut.

## Weitere offene Themen

- Restliche Punkte siehe `TIERLIST_PLAN.md` Phase 1/4 (Test mit echter Session),
  Phase 5 (Politur/Härtung), Phase 6 (CF-Cache-Purge).
