# Speedtest — netpurple.net/speed

## Ziel
Eigener Speedtest unter `netpurple.net/speed`, NetPurple-Design, **nur für eingeloggte User**
(kein öffentliches Tool), Betrieb **ausschließlich auf dem Hetzner-VPS**, Auslegung bis **1 Gbit/s**
(Anschluss-Ceiling des Nutzers). Kein Cloudflare Worker.

## Server-Ist (91.99.80.37)
- Hetzner vServer, 2 vCPU (EPYC-Rome, shared), virtio-NIC, 20 TB Traffic/Monat inkl.
- Kette: Cloudflare (orange) → NPM-Container (:443, TLS) → Apache :8081 → `/var/www/netpurple`.
- Docker vorhanden. Kein nginx/PHP auf dem Host — Reverse-Proxy-Logik liegt im NPM-Container.

## Architektur (umgesetzt)
| Teil | Umsetzung |
|---|---|
| **Frontend** | Statische Seite `/var/www/netpurple/speed/` (`index.html`, `app.js`, `styles.css`) im NetPurple-Style: Partikel-BG, Theme-Toggle, 270°-Radial-Gauge, Ergebnis-Cards Download / Upload / Ping / Jitter. LibreSpeed-Engine v6.2.1 (`speedtest.js` + `speedtest_worker.js`) aus dem Container gezogen und ins Repo vendored (LGPL-3.0). |
| **Auth-Gate (Client)** | Beim Laden `account.get()` gegen Appwrite (`api.netpurple.net`, Projekt `699f23920000d9667d3e`); nicht eingeloggt → Redirect `/login?return=/speed`. Overlay bleibt sichtbar bis geklärt. |
| **Auth-Gate (Server)** | `app.js` holt nach `account.get()` ein Appwrite-JWT (`account.createJWT()`) und POSTet es an `/speed/auth`. Der Validator-Container prüft es gegen `api.netpurple.net/v1/account` und setzt ein HMAC-signiertes Cookie `speed_gate` (HttpOnly, Secure, SameSite=Strict, `Path=/speed/`, 15 min). nginx prüft dieses Cookie per `auth_request` vor **jedem** Backend-Request. Ohne gültige NetPurple-Session → 401. Cookie wird vor jedem Testlauf neu geholt. |
| **Backend** | Docker-Container `speedtest-backend` aus **`ghcr.io/librespeed/speedtest:latest`**, `MODE=backend`, `TELEMETRY=false`, gebunden an **`172.17.0.1:9080`** (Docker-Bridge, nicht öffentlich). Endpunkte im Web-Root: `garbage.php`, `empty.php`, `getIP.php`. `restart=unless-stopped`. |
| **Validator** | Docker-Container `speed-auth`, Image `node:20-alpine`, gebunden an **`172.17.0.1:9081`**. Skript `/opt/speed-auth/validator.js` (nur `node:http` + `node:crypto`, keine npm-Deps). HMAC-Key `/opt/speed-auth/secret` (chmod 600). Routen: `POST /auth`, `GET /verify`. `restart=unless-stopped`. |
| **Routing** | Im **NPM-Container**, Proxy Host `netpurple.net` (id 5), Advanced-Config: `location = /speed/auth` → `:9081/auth`; `location = /speed/_gate_check` (internal) → `:9081/verify`; `location /speed/backend/` mit `auth_request /speed/_gate_check;` → `:9080`. `/speed/` selbst bleibt statisch über Apache. |
| **Cloudflare** | Läuft über den orange-Cloud-Pfad. Upload-Blobs 20 MB (< 100 MB CF-Free-Limit). |

## Zugriffsschutz (Ebenen)
1. Clientseitiges Login-Gate (Redirect) — umgesetzt.
2. Seite nirgends verlinkt, `<meta robots noindex,nofollow>` + `googlebot` noindex, `Disallow: /speed/` in `robots.txt`, nicht in `sitemap.xml`. — umgesetzt.
3. **Serverseitiges Gate** (Appwrite-JWT → signiertes Cookie → nginx `auth_request`) — umgesetzt. Backend-Endpunkte geben ohne gültige Session 401 (verifiziert per curl über Cloudflare).
4. Optional / Defense-in-Depth: Cloudflare-WAF-Rate-Limit auf `/speed/*` (500 req/60 s/IP → 60 s Block). Nur noch gegen einen kompromittierten Account nötig. **Offen** — MCP-Token ist read-only, muss übers CF-Dashboard.

> Ebene 3 ersetzt die frühere Annahme „serverseitiges Gate nicht möglich": Session-**Cookies** gehen
> nicht cross-domain, ein Appwrite-**JWT** aber schon. Der Validator tauscht das JWT einmalig gegen
> ein lokales, für `netpurple.net` gültiges Cookie.

## NPM-Details (für spätere Änderungen)
- Proxy Host id **5** = `netpurple.net`. Live-Conf im Container: `/data/nginx/proxy_host/5.conf`.
- Der `location /speed/backend/`-Block ist in NPM **persistiert**: DB `/data/database.sqlite`,
  Tabelle `proxy_host` (`id=5`), Spalte `advanced_config` – ans Ende hinter die Matrix-`.well-known`-Blöcke
  gehängt. DB-Backup vor dem Schreiben: `/data/database.sqlite.bak.<ts>` im Container. Live-`5.conf` ist
  deckungsgleich, per `nginx -t` + `nginx -s reload` aktiv. Überlebt jetzt NPM-Neustart / UI-Save.
- Im Block: `proxy_set_header X-Real-IP $http_cf_connecting_ip;` +
  `proxy_set_header X-Forwarded-For $http_cf_connecting_ip;` → `getIP.php` liefert die echte Client-IP
  (verifiziert: gibt die anfragende IP zurück statt einer Cloudflare-Edge-IP).
- Nicht ausgeführt: harter `docker restart nginx-proxy-manager-app-1` als Regen-Endkontrolle
  (nicht nötig – ein Save im NPM-UI löst denselben Regen aus).
- `advanced_config` (id 5) enthält jetzt zusätzlich `location = /speed/auth`, `location = /speed/_gate_check`
  (internal) und `auth_request` im `/speed/backend/`-Block. Letzter DB-Backup vor dem Schreiben:
  `/data/database.sqlite.bak.1788283928674`. Live-`5.conf` deckungsgleich (`nginx -t` ok, reload durch).

## Validator-Container `speed-auth`
- `docker run -d --name speed-auth --restart unless-stopped -v /opt/speed-auth:/app:ro -w /app -p 172.17.0.1:9081:9081 node:20-alpine node /app/validator.js`
- `/opt/speed-auth/validator.js` — Quelle liegt nur auf dem VPS (nicht im Repo, da VPS-spezifisch).
  Bei Änderung: Datei ersetzen + `docker restart speed-auth`.
- `/opt/speed-auth/secret` — 64 Hex-Zeichen HMAC-Key, chmod 600. Bei Rotation: Datei neu befüllen +
  `docker restart speed-auth`; alle bestehenden `speed_gate`-Cookies werden dadurch ungültig.
- `GET /verify` → 200/401 je nach Cookie (für `auth_request`). `POST /auth` mit `{"jwt": "..."}` oder
  Header `X-Appwrite-JWT` → prüft gegen `api.netpurple.net/v1/account`, setzt bei 200 das Cookie.

## VPS-TCP-Tuning (optional, empfohlen, reversibel) — NOCH OFFEN
`/etc/sysctl.d/99-net-speedtest.conf`:
```
net.core.default_qdisc          = fq
net.ipv4.tcp_congestion_control = bbr
net.core.rmem_max               = 67108864
net.core.wmem_max               = 67108864
net.ipv4.tcp_rmem               = 4096 87380 67108864
net.ipv4.tcp_wmem               = 4096 65536 67108864
```
Betrifft **alle Dienste** auf der Box. BBR i. d. R. unkritisch/besser. Rollback: Datei löschen + `sysctl --system`.
Ohne Tuning schafft ein Einzel-Stream evtl. nur ~500–700 Mbit/s; die Engine nutzt aber 8 Down-/5 Up-Streams,
kommt also auch ungetunt nah an Leitungsspeed.

## Traffic
~4 GB pro vollem Durchlauf. 20-TB-Kontingent ≈ 5000 Läufe/Monat → vernachlässigbar.

## Status
- [x] Backend-Container läuft (`speedtest-backend`, `172.17.0.1:9080`)
- [x] Routing über NPM (`/speed/backend/` → Container), end-to-end über Cloudflare getestet
- [x] Frontend gebaut (`speed/index.html` + `app.js` + `styles.css` + Engine vendored)
- [x] noindex / robots / kein Menülink
- [ ] deployed auf den Server (`git pull` in `/var/www/netpurple`) — offen: `app.js` + `styles.css`
- [ ] ein voller Durchlauf über `https://netpurple.net/speed` getestet (eingeloggt, Vordergrund-Tab)
- [x] NPM-Block in der NPM-DB persistiert (`proxy_host.advanced_config`, id 5) + `getIP.php` echte Client-IP
- [x] serverseitiges Gate (`speed-auth`-Container + `auth_request`), Backend gibt ohne Session 401
- [x] TCP-Tuning (BBR + fq, `eth0-fq.service`, 64-MB-Buffer) — ~994 Mbit/s per 4-Stream-curl bestätigt
- [ ] optional: Cloudflare-Rate-Limit-Regel (Defense-in-Depth)
