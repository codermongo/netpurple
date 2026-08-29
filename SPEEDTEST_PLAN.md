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
| **Auth-Gate** | Beim Laden `account.get()` gegen Appwrite (`api.netpurple.net`, Projekt `699f23920000d9667d3e`); nicht eingeloggt → Redirect `/login?return=/speed`. Overlay bleibt sichtbar bis geklärt. |
| **Backend** | Docker-Container `speedtest-backend` aus **`ghcr.io/librespeed/speedtest:latest`**, `MODE=backend`, `TELEMETRY=false`, gebunden an **`172.17.0.1:9080`** (Docker-Bridge, nicht öffentlich). Endpunkte im Web-Root: `garbage.php`, `empty.php`, `getIP.php`. `restart=unless-stopped`. |
| **Routing** | Im **NPM-Container**, Proxy Host `netpurple.net` (id 5), Advanced-Config: `location /speed/backend/ { proxy_pass http://172.17.0.1:9080/; ... proxy_buffering off; proxy_request_buffering off; client_max_body_size 100m; }`. `/speed/` selbst bleibt statisch über Apache. |
| **Cloudflare** | Läuft über den orange-Cloud-Pfad. Upload-Blobs 20 MB (< 100 MB CF-Free-Limit). |

## Zugriffsschutz (Ebenen)
1. Clientseitiges Login-Gate (Redirect) — umgesetzt.
2. Seite nirgends verlinkt, `<meta robots noindex,nofollow>` + `googlebot` noindex, `Disallow: /speed/` in `robots.txt`, nicht in `sitemap.xml`. — umgesetzt.
3. **Offen:** Cloudflare-WAF-Rate-Limit auf `/speed/*` (z. B. 500 req/60 s/IP → 60 s Block) gegen Missbrauch der Backend-URLs als Bandbreiten-Amplifier. Via Cloudflare-MCP, kein Install.

> Ein echtes serverseitiges „nur NetPurple-User"-Gate ist nicht möglich — die Appwrite-Session-Cookies
> liegen auf `api.netpurple.net`, NPM/Apache sehen sie nicht. Für „nur für mich" reichen Ebene 1–3.

## NPM-Details (für spätere Änderungen)
- Proxy Host id **5** = `netpurple.net`. Live-Conf im Container: `/data/nginx/proxy_host/5.conf`.
- Der `location /speed/backend/`-Block wurde direkt in `5.conf` eingefügt und mit `nginx -s reload` aktiv
  geschaltet (zero-downtime, nach `nginx -t`).
- **Noch offen:** denselben Block in NPM persistieren, sonst überschreibt ein NPM-Neustart / UI-Save
  die `5.conf` aus der DB und der Block ist weg. Sauberster Weg: im NPM-UI bei Proxy Host `netpurple.net`
  → Tab **Advanced** den Block ans Ende hängen (die Matrix-`.well-known`-Blöcke stehen dort schon).
  Optionaler Feinschliff im selben Block: `proxy_set_header X-Forwarded-For $http_cf_connecting_ip;` —
  dann zeigt `getIP.php` die echte Nutzer-IP statt der Cloudflare-Edge-IP.

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
- [ ] deployed auf den Server (`git pull` in `/var/www/netpurple`)
- [ ] ein voller Durchlauf über `https://netpurple.net/speed` getestet
- [ ] NPM-Block in der NPM-DB persistiert (Advanced-Tab)
- [ ] optional: TCP-Tuning
- [ ] optional: Cloudflare-Rate-Limit-Regel
