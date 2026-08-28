# Projektplan: User-eigene Tierlists

> **Status:** Entwurf / WIP — wird gemeinsam durchgegangen und verfeinert.
> **Nichts wird implementiert, bis explizit freigegeben.**
> Letzte Aktualisierung: 2026-08-28

---

## 1. Ziel

Angemeldete User können **eigene Tierlists erstellen und bearbeiten**, zusätzlich
zu den drei bestehenden kuratierten Listen. Das Feature ist **rein additiv**.

---

## 2. Harte Constraints (nicht verhandelbar)

| # | Constraint |
|---|-----------|
| C1 | Die bestehenden Listen (Anime / Games / Serien) werden **nicht angefasst** — weder Code, Tabellen (`anime_ranking_1`, `69e882d50014dcc8582c` = spiele, `6a02d598001305384d8b` = Serien), noch Permissions. |
| C2 | Sie werden **unter exakt demselben Pfad** ausgeliefert wie jetzt: `/tier/anime/`, `/tier/games/`, `/tier/series/`. Keine Redirects, keine Umbenennung. |
| C3 | Neue Tabellen, neue Routen, neuer Code — sauber getrennt vom Bestehenden. |
| C4 | Design/Look bleibt konsistent (bestehende `tier/styles.css`, `.tool-card`, `.menu-item-circle`, Glas-Optik, Dark-Mode). |

---

## 3. User-Flow (Vorgabe)

### 3.1 Einstieg
- **4. Karte in der `.tools-grid` auf `/tier/`** — „+ Eigene Tierlist erstellen",
  gleiche Glas-Optik wie Anime/Series/Games (F1).
- Zusätzlich „Neue Liste"-Button auf `/tier/me`.
- Wenn **nicht eingeloggt** → Klick leitet auf `/login?return=/tier/me`.

### 3.2 Erstell-Dialog (geführt, mehrstufig)
1. **Kategorie wählen:** `Anime` · `Games` · `Serien` (Pflicht, genau eine).
   Bestimmt die Cover-Quelle und ggf. Zusatzfelder (play_time / story_length / price).
2. **Name vergeben:** Freitext.
   - Der Name ist **kein Identifier**. Die Liste wird im Backend unter einer
     **generierten ID** gespeichert (`$id` des Appwrite-Dokuments).
   - Name ist ein **änderbares Attribut** → jederzeit umbenennbar.
   - **Mehrere Listen mit gleichem Namen sind erlaubt.**
3. **Tiers auswählen:** Toggle pro Tier aus der festen Leiter
   `Best of All Time → S → A → B → C → D → E → F → -F`.
   - User schaltet an/aus, welche Tiers die Liste haben soll.
   - **Reihenfolge bleibt fix** (oben = Best of All Time, unten = -F); es wird nur
     die Teilmenge gewählt.
   - **Default vorausgewählt: `S A B C D E F`** (ohne `Best of All Time` und `-F`).
   - Mindestens 1 Tier muss aktiv sein.
   - Nach dem Erstellen sind die Tiers im MVP **fix** (Ändern → Phase 2).
4. **Fertig** → User sieht **eine leere Tierlist** mit genau den gewählten Tiers,
   im bekannten Editor-Layout, ohne Einträge.

---

## 4. Datenmodell (Vorschlag — zu bestätigen)

Zwei **neue** Tabellen in `Netpurple_DB` (`699f251000346ad6c5e7`, TablesDB).
Bestehende Tabellen unberührt.

### 4.1 `user_tierlists` (Metadaten — eine Zeile = eine Liste)
- `rowSecurity: true`
- Tabellen-Permission: `create("users")`
- Pro Zeile bei Erstellung gesetzt:
  - `read("any")` *(bei öffentlich)* **oder** `read("user:<id>")` *(bei privat)* → F4
  - `update("user:<id>")`, `delete("user:<id>")`

| Spalte | Typ | Pflicht | Notiz |
|--------|-----|---------|-------|
| `owner` | string(64) | ja | Appwrite User-`$id` |
| `name` | string(120) | ja | Anzeigename, frei änderbar, nicht unique |
| `category` | enum | ja | `anime` \| `games` \| `series` |
| `tiers` | string(512) | ja | JSON-Array der aktiven Tier-Namen in fixer Reihenfolge, z. B. `["S","A","B","C","D"]` |
| `visibility` | enum | ja | `public` \| `private` (Default → F4) |
| `created_at` | datetime | – | Appwrite `$createdAt` reicht ggf. |

- **Index:** `owner` (für „Meine Listen"), ggf. `visibility`.

### 4.2 `user_tierlist_items` (Einträge — eine Zeile = ein Item)
- `rowSecurity: true`
- Tabellen-Permission: `create("users")`
- Pro Zeile: `read("any")` (oder an die Liste gekoppelt → F4),
  `update("user:<id>")`, `delete("user:<id>")`

| Spalte | Typ | Pflicht | Notiz |
|--------|-----|---------|-------|
| `list_id` | string(64) | ja | `$id` aus `user_tierlists` |
| `owner` | string(64) | ja | für Row-Permissions / Queries |
| `title` | string(255) | ja | |
| `notes` | string(1000) | nein | |
| `tier` | enum | nein | **dieselben 9 Werte** wie bestehend; `null` = Unranked |
| `cover_url` | string(url) | nein | |
| `tier_position` | double | nein | Fractional Index (wie bestehend) |
| `play_time` | double | nein | nur relevant für anime/series |
| `story_length` | double | nein | nur relevant für games |
| `price` | double | nein | nur relevant für games |

- **Index:** `list_id` (Pflicht — Items einer Liste laden),
  ggf. zusammengesetzt `list_id` + `owner`.

> Hinweis: `tier` bleibt der bestehende 9-Werte-Enum. Die *Auswahl* der Tiers
> lebt in `user_tierlists.tiers` (nur Anzeige/Editor), nicht im Item.

### 4.3 Limits (F7)
- **Max. 3 `user_tierlists`-Zeilen pro `owner`** — Client zählt vor dem Erstellen
  (`Query.equal("owner", uid)` + `Query.limit(1)` mit `total`), Button ab 3 aus.
- **Max. 50 `user_tierlist_items` pro `list_id`** — Client zählt vor „Add", Button
  ab 50 aus + Hinweis.
- Rein clientseitig durchgesetzt (kein Server-Hook). Umgehbar per direktem
  API-Call, aber zusammen mit Appwrites Rate-Limit als MVP-Schutz akzeptiert.

---

## 5. Frontend-Architektur (Vorschlag)

### 5.1 Editor: eigene Kopie, nicht das Bestehende umbauen
Wegen C1 wird **`tier/app.js` nicht angefasst**. Die User-Liste bekommt eine
**eigene `tier/custom/app.js`** — Start als Kopie von `tier/app.js`, dann angepasst:

- `COLLECTION_ID` → fix `user_tierlist_items`.
- Config kommt aus der geladenen `user_tierlists`-Zeile (`?id=`), nicht aus
  `window.TIER_PAGE_CONFIG`: `category` → Cover-Provider, `tiers` → gerenderte
  Tier-Reihen.
- Items laden: `Query.equal("list_id", <id>)`.
- Beim Item-Create: `list_id`, `owner` + Row-Permissions mitgeben.
- `state.canManage` = `state.user?.$id === list.owner` (statt „irgendwie eingeloggt");
  fremde öffentliche Liste = read-only.
- Tier-Render-Schleife: `TIER_NAMES` → `list.tiers`.
- Trade-off: ~Code-Duplikat (`tier/app.js` ist groß). Bewusst akzeptiert, um die
  drei Bestandslisten zu 100 % unberührt zu lassen. Gemeinsame Utils könnten
  später in eine `tier/shared.js` extrahiert werden (separater Schritt, eigenes QA).

### 5.2 Neue Seiten / Routen
- **`tier/custom/index.html`** — Editor einer User-Liste. Lädt die Liste aus
  `?id=<id>` (Dokument-`$id`). Name nur Anzeige. Statische Datei, **kein
  Apache-Rewrite**.
- **`tier/me/index.html`** — „Meine Listen". Übersicht der eigenen Tierlists,
  „Neue Liste"-Button (öffnet Erstell-Dialog), Umbenennen/Löschen je Zeile.
- **Erstell-Dialog:** Modal. Primär von der 4. Karte auf `/tier/` **und** vom
  „Neue Liste"-Button auf `/tier/me`. Kann als gemeinsame `tier/create.js`
  (Modal-Markup + Logik) in beide Seiten eingebunden werden.
- Login-Gate: ohne Session → `/login?return=/tier/me`.

### 5.3 Auth
- Nutzt den bestehenden `auth.js`-Flow (Appwrite E-Mail/PW + Google).
- Button nur sinnvoll mit Session; sonst Redirect `/login?return=…`.

---

## 6. Entscheidungen & offene Punkte

### Entschieden

| # | Frage | Entscheidung |
|---|-------|--------------|
| **F1** | Einstiegs-Button | **4. Karte in der `.tools-grid` auf `/tier/`**: „+ Eigene Tierlist erstellen", gleiche Glas-Optik wie Anime/Series/Games. |
| **F2** | Default-Tiers im Dialog | **`S A B C D E F`** vorausgewählt. `Best of All Time` und `-F` aus. User togglet jeden einzeln, min. 1 aktiv. |
| **F3** | Route-Form einer User-Liste | **`/tier/custom?id=<id>`** — eine echte Datei `tier/custom/index.html`, Liste per Query-Param. **Kein Apache-Rewrite nötig.** |
| **F4** | Sichtbarkeit | **Wahl im Dialog (öffentlich / privat), Default = privat.** Privat → `read("user:<id>")`; öffentlich → `read("any")`. |
| **F5** | „Meine Listen"-Seite | **Ja, unter `/tier/me`** (Datei `tier/me/index.html`). Übersicht eigener Listen + „Neue Liste" + Umbenennen/Löschen. |
| **F6** | Tiers nachträglich ändern | **Phase 2.** Im MVP sind die Tiers nach dem Erstellen fix. |
| **F7** | Limits pro User | **Max. 3 Tierlists pro User, max. 50 Einträge pro Liste.** Client-seitig geprüft + im Dialog/Editor kommuniziert; Button „Neue Liste" ab 3 deaktiviert. |
| **F9** | Signup | **Bleibt offen** für jede E-Mail (Status quo). |

### Noch offen (Vorschläge — nur bei Widerspruch besprechen)

| # | Frage | Vorschlag |
|---|-------|-----------|
| **F8** | Abuse-Schutz beim Erstellen | Appwrites eingebautes Rate-Limit + die 3/50-Caps reichen für MVP. Turnstile optional als späterer Ausbau. |
| **F10** | Liste löschen | Hard delete, Bestätigungsdialog, Items werden mit-gelöscht (Client iteriert). |
| **F11** | Name im Editor | Inline editierbar (Klick auf Titel → Feld → speichert `name`). |
| **F12** | Share-Snapshot (`?share=`) für User-Listen | Nein. Öffentliche Liste = teilbar über ihre `/tier/custom?id=`-URL. |
| **F13** | Cover-Provider | Wie bestehend, pro Kategorie (Jikan / iTunes o. ä. — Code aus `tier/app.js` wiederverwenden). |

---

## 7. Phasen / Aufgaben

### Phase 0 — Plan finalisieren *(jetzt)*
- [x] F1–F7, F9 entschieden.
- [x] F8, F10–F13 auf Vorschlagswerten (nur bei Widerspruch ändern).
- [ ] Datenmodell (Abschnitt 4) final bestätigen.
- [ ] Freigabe zum Start von Phase 1.

### Phase 1 — Appwrite Setup *(kein Frontend-Code)* — ✅ ERLEDIGT 2026-08-28
- [x] Tabelle `user_tierlists` — `owner`(str64), `name`(str120), `category`(enum anime/games/series), `tiers`(str512), `visibility`(enum public/private). Index `idx_owner` (key, [owner]). Perm `create("users")`, rowSecurity.
- [x] Tabelle `user_tierlist_items` — `list_id`(str64), `owner`(str64), `title`(str255), `notes`(str1000), `tier`(enum 9 Werte), `cover_url`(url), `tier_position`/`play_time`/`story_length`/`price`(double). Indexe `idx_list` ([list_id]) + `idx_list_owner` ([list_id,owner]). Perm `create("users")`, rowSecurity.
- [x] Funktionstest (Console-MCP): Row-Create mit `read("user:X")` (privat) und `read("any")` (öffentlich) → `$permissions` korrekt gesetzt. Query per `idx_list` (+ orderAsc `tier_position`) und `idx_owner` liefern erwartete Ergebnisse. Enum-Whitelist lehnt ungültigen `tier`-Wert mit 400 ab.
- [x] Alle Testzeilen wieder gelöscht — beide Tabellen leer (`total: 0`).
- [ ] **Offen:** echte Cross-User-Isolation (User A sieht private Liste von User B nicht) — nur mit echten User-Sessions testbar → in Phase 2 im Browser.

### Phase 2 — Erstell-Dialog + Einstieg
- [ ] 4. Karte „+ Eigene Tierlist erstellen" in `tier/index.html` (`.tools-grid`).
- [ ] Mehrstufiges Modal (`tier/create.js` + Markup): Kategorie → Name →
      Tier-Toggles (Default `S A B C D E F`) → öffentlich/privat (Default privat) → „Erstellen".
- [ ] Vor dem Erstellen: eigene Listen zählen; bei **≥ 3** Button aus + Hinweis.
- [ ] Anlegen der `user_tierlists`-Zeile mit Row-Permissions passend zu
      öffentlich/privat, Redirect auf `/tier/custom?id=<neueId>`.
- [ ] Login-Gate: ohne Session → `/login?return=/tier/me`.

### Phase 3 — `tier/custom/app.js` (Kopie + Anpassung) — ✅ ERLEDIGT 2026-08-28
- [x] `tier/app.js` → `tier/custom/app.js` kopiert.
- [x] Config aus geladener `user_tierlists`-Zeile (`?id=`) statt `TIER_PAGE_CONFIG`:
      `category` → Cover-Provider + Label + sichtbare Zusatzfelder, `tiers` → Tier-Reihen.
- [x] `COLLECTION_ID = "user_tierlist_items"`, `list_id`-Filter beim Laden,
      `list_id`/`owner` + Row-Permissions beim Item-Create.
- [x] `canManage = currentUserId === LIST_OWNER`; `readOnly` bei fremder öffentlicher
      Liste (kein Drag, kein Add/Edit).
- [x] 50-Item-Cap im Save-Pfad.
- [x] Leere Liste rendert trotzdem die Tier-Reihen (nicht mehr „no items"-Leerzustand).
- [x] **Nachweis: `git diff main -- tier/app.js tier/anime tier/games tier/series` = leer.**

### Phase 4 — `tier/custom/` + `tier/me/` — ✅ ERLEDIGT 2026-08-28
- [x] `tier/custom/index.html` — Editor-Shell (nur `./app.js`, kein `../app.js`),
      Listen-Header mit Name + Kategorie + „Rename" (nur Owner), Read-only-Banner.
      Zusatzfelder je Kategorie ein-/ausgeblendet (Play Time bzw. Story Length + Preis).
- [x] Getestet lokal (anonym): öffentliche Liste → leere Tierlist mit gewählten
      Tiers, read-only; ungültige `?id=` → „does not exist or private".
- [x] `tier/me/index.html` — Übersicht (`Query.equal("owner", uid)`), Karten mit
      Kategorie/Sichtbarkeit-Pills + Tier-Liste, „+ New tierlist" (ab 3 disabled,
      öffnet `create.js`-Dialog), Rename (prompt), Delete (Confirm + Items cascaded).
      Login-Gate: ohne Session → `/login?return=/tier/me` (lokal verifiziert).
- [ ] **Offen (braucht echte Session):** Owner-Modus (Add/Edit/Drag/Rename), 50-Cap,
      Delete-Cascade, voller Create→Redirect→Editor-Flow. → im Staging/Prod bzw.
      vom User lokal eingeloggt testen.

### Phase 5 — Politur & Härtung
- [ ] Rename, Delete (F10), Limits (F7), evtl. Turnstile (F8).
- [ ] Leerstände, Fehlerfälle, Mobile, Dark-Mode.
- [ ] QA: Constraints C1–C4 nachweislich eingehalten.

### Phase 6 — Deploy
- [ ] Branch `feature/user-tierlists` → PR → Merge `main`.
- [ ] Server: `cd /var/www/netpurple && git pull` (Apache-DocRoot, Port 8081 hinter NPM).
- [ ] Cloudflare-Cache purgen (Zone `spargummi`… → **netpurple.net**,
      Zone-ID `3eca4e415a60b7fac66bb98cd374720e`). Achtung: aktueller
      Cloudflare-MCP-/OAuth-Scope kann **kein** Purge → scoped Token nötig.

---

## 8. Infrastruktur-Kontext (Ist-Zustand)

- **Auth:** Appwrite Cloud (Custom Domain `api.netpurple.net` → `fra.cloud.appwrite.io`),
  Projekt `699f23920000d9667d3e`, E-Mail/PW + Google OAuth, E-Mail-Verifizierung `/verify`.
  Registrierung derzeit **offen** (`block_not_net_user` hat kein Event verdrahtet).
- **DB:** `Netpurple_DB` `699f251000346ad6c5e7` (TablesDB).
- **Editor-Frontend:** `tier/app.js` (geteilt) + `tier/<kat>/app.js` (nur Config) +
  `tier/<kat>/index.html`. Appwrite Web-SDK 14.0.1 via CDN.
- **Hosting:** `/var/www/netpurple` = Git-Checkout (`origin/main`), Apache vHost
  `:8081` → Nginx Proxy Manager (Docker) → Cloudflare (proxied).
- **Repo:** `github.com/codermongo/netpurple`.

---

## 9. Risiken / Notizen

- **Regressionsgefahr** an den 3 Bestandslisten, wenn `tier/app.js` geteilt wird
  und wir es umbauen. → Entweder rückwärtskompatibel halten (Config-Fallback auf
  `TIER_PAGE_CONFIG`) oder für User-Listen eine eigene `tier/user-app.js` bauen.
- **Offene `create("users")`-Tabellen** = jeder eingeloggte User kann schreiben.
  Die 3/50-Caps sind **nur clientseitig** — per direktem API-Call umgehbar. Bei
  offenem Signup (F9) bleibt ein Rest-Spam-Risiko; Appwrite-Rate-Limit + evtl.
  späterer Server-Hook / Turnstile (F8) als Fallback.
- Kein Apache-Rewrite nötig: `tier/custom/` und `tier/me/` sind echte Dateien;
  Listen-ID kommt aus `?id=`.
- `api.netpurple.net` läuft **DNS-only** (nicht proxied) — unverändert lassen.
