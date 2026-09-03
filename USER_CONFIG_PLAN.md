# Projektplan: `user_config` — globale Dark- & Performance-Einstellung

> **Status:** Entscheidungen E1–E8 bestätigt (2026-09-03). Phase 1 startet.
> Letzte Aktualisierung: 2026-09-03

---

## 1. Ziel

Die zwei Einstellungen **Dark Mode** und **Performance Mode** (`low-power`) aus den
verstreuten Einzel-Buttons herauslösen in **ein** Einstellungs-Panel, verankert
**oben rechts unter dem Login-/User-Button**. Die Toggles wirken global (ganze
Seite, wie bisher über Body-Klassen).

**Persistenz:**
- nicht eingeloggt → `localStorage` (wie heute)
- eingeloggt → Appwrite-Tabelle `user_config`, synchronisiert

---

## 2. Ist-Zustand (was ersetzt / vereinheitlicht wird)

Die Toggle-Logik ist **mehrfach dupliziert**:

| Ort | macht |
|---|---|
| `menu.js` | Dark + Low-Power auf den „Hauptseiten" (`index`, `games`, `list`, `login`, `sound`, `tools`, `user`, `verify`, `404`). Erzeugt den Low-Power-Button dynamisch. |
| `tier/index.html` (inline) | eigene Kopie derselben Logik |
| `tier/me/index.html` (inline) | eigene Kopie |
| `tier/app.js`, `tier/custom/app.js`, `speed/app.js` | lesen `localStorage["darkMode"]` / `["lowPowerMode"]` beim Init nochmal selbst |
| `particles.js` | liest `lowPowerMode` für die Partikeldichte |

**Positionen (fixed):**
- `.theme-toggle-container` — oben **links** (`top/left: 1.5rem`), Reihe Kreis-Buttons:
  Theme-Toggle `#themeToggleItem`, Back-Link, ggf. „My tierlists"; Low-Power-Button
  wird per JS hier reingehängt.
- `.user-login` / `.user-menu` — oben **rechts** (`top/right: 1.5rem`), 56 px hoch.
  `auth.js` setzt `body[data-auth="in"|"out"]`; CSS blendet `.auth-out` / `.auth-only`
  entsprechend.

**Auth:** `auth.js` (Hauptseiten) kennt die Session via `account.get()` und
`state.user`. Tier-/Speed-Seiten rufen `account.get()` je selbst in ihrem `app.js`
und schalten den Login-Kreis auf `/user` um.

---

## 3. Zielbild

### 3.1 UI
Neuer Kreis-Button **Zahnrad** unter dem User-/Login-Button (oben rechts, also ein
zweites fixed-Element bei `top: calc(1.5rem + 56px + 12px); right: 1.5rem`).
Klick öffnet ein kompaktes Glas-Panel (gleiche `--card-glass-*`-Optik) mit **drei
beschrifteten Switch-Toggles** plus **Status-Zeilen**:

```
┌───────────────────────────────────┐
│  Einstellungen                    │
│  Dark Mode              [ ●   ]   │
│  Performance Mode       [   ● ]   │
│    └ nur auf Mobilgeräten [ ● ]   │   (eingerückt; dim wenn Performance aus)
│  ─────────────────────────────    │
│  Dark Mode: an                    │
│  Performance: aus                 │
│  Mobil-only: an                   │
└───────────────────────────────────┘
```

- **Toggle 1 — Dark Mode:** global `body.dark-mode`.
- **Toggle 2 — Performance Mode:** Master-Schalter für `body.low-power-mode`.
- **Toggle 3 — „nur auf Mobilgeräten":** Modifikator zu Toggle 2. Ist er an, wird
  `low-power-mode` **nur** angewandt, wenn die Ansicht mobil ist
  (`matchMedia("(max-width: 768px)")`). Ist er aus, gilt Performance Mode überall.
  Effektiv:  `applyLowPower = low_power && (!mobile_only || isMobileViewport())`.
  Ein `matchMedia`-Listener wertet bei Resize/Orientierung neu aus.
- **Status-Zeilen** unten: Klartext des aktuellen Stands, live aktualisiert
  („Dark Mode: an", „Performance: aus", „Mobil-only: an"). Bei aktivem
  „nur auf Mobil" zusätzlich der Hinweis, ob es gerade greift (z. B.
  „Performance: an (aktiv – mobile Ansicht)" / „an (inaktiv – Desktop)").
- `#themeToggleItem` (links) **entfällt** auf allen Seiten; der Low-Power-Button
  wird nicht mehr per JS erzeugt.
- Panel schließt bei Klick außerhalb / Esc. Kein Overlay-Backdrop.
- Toggles zeigen sofort Wirkung (Body-Klasse), Persistenz passiert im Hintergrund.

### 3.2 Datenfluss

```
Seiten-Load:
  1. (pre-paint, <head>) localStorage lesen → body-Klassen setzen  → kein Flash
  2. config.js lädt → Panel rendern, Toggles auf localStorage-Stand
  3. account.get():
       - nicht eingeloggt → fertig, localStorage ist die Quelle
       - eingeloggt → user_config-Row holen:
           - Row existiert  → Werte anwenden + localStorage überschreiben (Server gewinnt)
           - Row fehlt      → aus aktuellem localStorage-Stand anlegen (Migration)

Toggle-Klick:
  - Body-Klasse + localStorage sofort setzen
  - eingeloggt → debounced updateRow(user_config)
```

Konfliktregel: **Server gewinnt beim Login**, lokal ist nur Cache/Anon-Quelle.
Erst-Login mit lokalen Prefs → einmalige Migration nach oben.
Logout → localStorage-Werte bleiben stehen (nahtlos weiter als Anon).

---

## 4. Datenmodell — Tabelle `user_config`

`Netpurple_DB` (`699f251000346ad6c5e7`, TablesDB). **Eine Row pro User.**

- **Row-`$id` = Appwrite User-`$id`** → direkter `getRow(id)`, keine Query nötig.
- `rowSecurity: true`, Tabellen-Permission `create("users")`.
- Pro Row bei Erstellung: `read("user:<id>")`, `update("user:<id>")`, `delete("user:<id>")`.

| Spalte | Typ | Default | Notiz |
|--------|-----|---------|-------|
| `dark_mode` | boolean | `false` | |
| `low_power` | boolean | `false` | Master-Performance-Schalter |
| `low_power_mobile_only` | boolean | `false` | Modifikator: Performance nur bei mobiler Ansicht |

`updated_at` nicht nötig — Appwrite liefert `$updatedAt`.

Bewusst **explizite Spalten** statt JSON-Blob — typisiert, später leicht
erweiterbar (weitere Toggles = weitere Spalten).

**localStorage-Keys** (Cache + Anon-Quelle): `darkMode`, `lowPowerMode` (beide
unverändert) + **neu `lowPowerMobileOnly`**.

---

## 5. Frontend-Architektur

### 5.1 Neues `config.js` (geteilt, auf **allen** Seiten)
- Rendert Zahnrad-Button + Panel (3 Toggles + Status-Zeilen), fixed oben rechts.
- Liest/schreibt `localStorage` (`darkMode`, `lowPowerMode`, `lowPowerMobileOnly`).
- `account.get()` mit modul-internem Promise-Cache; bei Session → `user_config`
  lesen / bei 404 anlegen / bei Toggle schreiben (debounced ~400 ms).
- **Effektive Anwendung:** `dark-mode` = `darkMode`; `low-power-mode` =
  `lowPowerMode && (!lowPowerMobileOnly || matchMedia("(max-width:768px)").matches)`.
  `matchMedia`-Change-Listener wertet neu aus.
- Setzt Body-Klassen, aktualisiert die Status-Zeilen, feuert
  `CustomEvent("np:configchange", { detail: { dark, lowPower, mobileOnly, effectiveLowPower } })`
  am `document`.
- Kein globales API nötig; optional `window.NPConfig.get()/set()` für später.

### 5.2 `<head>`-Anti-Flash-Snippet (alle Seiten)
Winziges blockierendes Inline-`<script>` ganz oben:
```html
<script>try{var d=localStorage;if(d.getItem('darkMode')==='true')document.documentElement.classList.add('pending-dark');if(d.getItem('lowPowerMode')==='true')document.documentElement.classList.add('pending-lp');}catch(e){}</script>
```
`config.js` übernimmt die `pending-*`-Marker früh auf `body`. (Alternative: heute
akzeptierten Flash lassen — siehe Entscheidung E3.)

### 5.3 Aufräumen
- `menu.js`: Dark-/Low-Power-Funktionen raus (bzw. `menu.js` ganz durch `config.js`
  ersetzt).
- `tier/index.html`, `tier/me/index.html`: Inline-Toggle-Blöcke raus.
- `tier/app.js`, `tier/custom/app.js`, `speed/app.js`: eigene `darkMode`/`lowPowerMode`-
  Init-Reads raus (Body-Klasse kommt jetzt zentral).
- `#themeToggleItem`-Button-Markup aus allen 16 `.theme-toggle-container` entfernen.
- `particles.js`: statt einmaligem Read auf `np:configchange` hören (oder wie heute
  erst beim nächsten Load wirken — Entscheidung E4).

### 5.4 Betroffene Dateien (~20)
16 HTML mit `.theme-toggle-container` + `style.css` (Panel-CSS) + `config.js` (neu)
+ `menu.js` + `particles.js` + `tier/app.js` + `tier/custom/app.js` + `speed/app.js`
+ Appwrite-Setup (Tabelle) + `MEMORY`/Doku.

---

## 6. Entscheidungen (bestätigt 2026-09-03)

| # | Frage | Entscheidung |
|---|-------|--------------|
| **E1** | Panel-Form | **Zahnrad-Kreis-Button** unter dem User-Button → öffnet Glas-Panel. |
| **E2** | Konfliktregel Login | **Server gewinnt**; Erst-Login migriert lokale Werte einmalig nach oben. |
| **E3** | Anti-Flash-Snippet in jeden `<head>` | **Ja.** |
| **E4** | Live-Reaktion `particles.js` | **Sofort** — Partikel reagieren live auf `np:configchange`. |
| **E5** | `menu.js` | **Ganz löschen**, überall durch `config.js` ersetzen. |
| **E6** | Scope | **Alle 16 Seiten** in einem Rutsch. |
| **E7** | Spalten vs. JSON | **Explizite `boolean`-Spalten.** |
| **E8** | Position | Fixed oben rechts, direkt unter `.user-login` (56 px + 12 px Abstand); Mobile-Abstände im bestehenden `@media`-Block. |
| **E9** | 3. Toggle „Performance nur auf Mobil" | **Ja** — Modifikator zu Toggle 2, `matchMedia("(max-width: 768px)")`, Listener auf Resize. |
| **E10** | Status-Text im Panel | **Ja** — Klartext-Zeilen unten, live aktualisiert. |

---

## 7. Phasen

### Phase 1 — Appwrite Setup — ✅ ERLEDIGT 2026-09-03
- [x] Tabelle `user_config` in `Netpurple_DB` (`699f251000346ad6c5e7`) angelegt:
  Spalten `dark_mode`, `low_power`, `low_power_mobile_only` (alle `boolean`,
  `required: false`, `default: false`), `rowSecurity: true`, Tabellen-Permission
  `create("users")`. Alle Spalten `status: available`.
- [x] Probe-Row (`$id = phase1_probe`) mit `read/update/delete("user:phase1_probe")`
  angelegt — Permissions + alle 3 Bools korrekt gespeichert — danach gelöscht.
  Tabelle wieder leer.
- [ ] **Offen (braucht echte Sessions):** Cross-User-Isolation im Browser (User A
  liest/schreibt `user_config` von User B nicht) → in Phase 5.

### Phase 2 — `config.js` + Panel — ✅ ERLEDIGT 2026-09-03
- [x] `config.js`: Zahnrad-Panel, 3 Toggles + Status, localStorage + `user_config`-Sync,
  `matchMedia`-Listener, `np:configchange`-Event. Panel-CSS **in `config.js` injiziert**
  (nicht in `style.css`), damit es auf jeder Seite unabhängig vom Stylesheet greift.
- [x] Anti-Flash-Snippet als erstes `<body>`-Kind.
- [x] `index.html` verdrahtet, lokal getestet (Toggles, Persistenz, Reload ohne Flash,
  Mobil-only, Partikel live).

### Phase 3 — Ausrollen auf alle 16 Seiten — ✅ ERLEDIGT 2026-09-03
- [x] Codemod über die restlichen 15 Seiten: Anti-Flash-Snippet, `#themeToggleItem`
  raus, `config.js` verdrahtet (`/config.js`).
- [x] `menu.js` gelöscht (keine Referenzen mehr).
- [x] Inline-Toggle-Blöcke aus `tier/index.html` + `tier/me/index.html` raus.
- [x] `tier/app.js`, `tier/custom/app.js`: `initThemeToggle`/`initLowPowerMode` +
  Aufrufe entfernt. `speed/app.js`: die 2 Prefs-Reads raus.
- [x] Lokal geprüft: `index`, `games`, `tier/anime`, `tier/me`, `login` — Panel da,
  Toggles wirken, Dark-Mode-Inversion ok, keine Konsolenfehler.

### Phase 4 — `particles.js` an das Event hängen — ✅ ERLEDIGT (Teil von Phase 2)
- [x] `particles.js`: `start()`/`stop()` statt einmaligem `return`; hört auf
  `np:configchange`, schaltet Partikel live an/aus.

### Phase 5 — QA
- Anon: Toggle → Reload → hält. Kein Flash.
- Eingeloggt: Toggle → anderes Gerät / Reload → Wert kommt vom Server.
- Erst-Login mit lokalen Prefs → Migration.
- Logout → Werte bleiben, kein Fehler.
- Alle 16 Seiten: Panel da, Toggles wirken, altes Left-Cluster ohne Theme-Button ok.

### Phase 6 — Deploy
- Commit/Push, `git pull` auf dem Server. Kein CF-Cache-Problem (JS/CSS mit
  Query-Bust bzw. neue Datei).

---

## 8. Risiken / Notizen

- **16 `<head>` + 16 Markup-Stellen** anfassen — mechanisch, aber breit. Nach dem
  Ausrollen: Regressions-Check je Seite (Panel da? Toggle wirkt? Login-Cluster ok?).
- `speed/app.js` hat den JWT-Gate-Flow — nur die 2 Prefs-Reads entfernen, Rest nicht
  anfassen.
- Kuratierte Tierlists (`tier/anime|games|series`) nur im `<head>` + Menü-Markup
  betroffen, nicht in `tier/app.js`-Kernlogik.
- Doppelter `account.get()` (auth.js + config.js) auf Hauptseiten — akzeptiert für
  v1, später ggf. `config.js` an `auth.js`'s `state.user` hängen.
