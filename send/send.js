'use strict';
// NetPurple Send: Datei laden, hier im Browser entschlüsseln, ansehen oder speichern.
// Krypto-Beschreibung: siehe Kopf von purple_send.py (gleich in der App, send_crypto.dart).

const PurpleSend = (() => {
  const enc = new TextEncoder();

  function b64decode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function b64encode(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  async function hmac(keyBytes, label) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(label)));
  }

  async function aesCtr(keyBytes, iv, data) {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CTR', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, data));
  }

  /** Passwort -> {wrap, auth} (PBKDF2-HMAC-SHA512, 32 Byte, dann zwei HMAC-Ableitungen). */
  async function passwordKeys(password, saltB64, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const master = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-512', salt: b64decode(saltB64), iterations }, base, 256));
    return { wrap: await hmac(master, 'purple-send/wrap'), auth: await hmac(master, 'purple-send/auth') };
  }

  /** Fragment -> Datei-Schlüssel k. Mit Passwort: "p" + base64url(k XOR wrap). */
  function fileKey(fragment, wrap) {
    if (fragment.startsWith('p')) {
      if (!wrap) throw new Error('Passwort nötig');
      const wrapped = b64decode(fragment.slice(1));
      if (wrapped.length !== 32) throw new Error('Link unvollständig');
      return wrapped.map((b, i) => b ^ wrap[i]);
    }
    const k = b64decode(fragment);
    if (k.length !== 32) throw new Error('Link unvollständig');
    return k;
  }

  async function decryptMeta(k, metaB64, metaIvB64) {
    const metaKey = await hmac(k, 'purple-send/meta');
    const plain = await aesCtr(metaKey, b64decode(metaIvB64), b64decode(metaB64));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /** Chiffrat prüfen (SHA-256 aus dem Matrix-Event) und entschlüsseln. */
  async function decryptFile(k, meta, cipher) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', cipher));
    if (b64encode(hash).replace(/=+$/, '') !== meta.sha256.replace(/=+$/, '')) {
      throw new Error('Prüfsumme stimmt nicht – Datei beschädigt oder falscher Link');
    }
    return aesCtr(k, b64decode(meta.iv), cipher);
  }

  return { b64decode, b64encode, passwordKeys, fileKey, decryptMeta, decryptFile };
})();

if (typeof module !== 'undefined') module.exports = PurpleSend;

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const parts = location.pathname.split('/').filter(Boolean);
  const id = parts[parts.length - 1];
  const fragment = decodeURIComponent(location.hash.slice(1));
  const api = `../api/s/${encodeURIComponent(id)}`;

  let info = null;
  let k = null;
  let meta = null;
  let auth = null;
  let opened = null; // letzte Antwort von /open (Ablauf, verbleibende Abrufe)
  let blob = null; // entschlüsselte Datei – einmal geladen, für Ansehen und Speichern
  let busy = false;

  const ICONS = {
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
    video: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    pdf: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  };

  const EXT_MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
    bmp: 'image/bmp', svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mkv: 'video/x-matroska', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
    opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain',
    log: 'text/plain', csv: 'text/csv', json: 'application/json', xml: 'text/xml', yaml: 'text/plain', yml: 'text/plain',
  };
  const TEXT_LIMIT = 2 * 1024 * 1024;

  /** MIME aus den Metadaten, bei fehlendem/generischem Typ aus der Dateiendung. */
  function mimeOf() {
    const m = (meta.mime || '').toLowerCase().split(';')[0].trim();
    if (m && m !== 'application/octet-stream') return m;
    const ext = (meta.name || '').toLowerCase().split('.').pop();
    return EXT_MIME[ext] || 'application/octet-stream';
  }

  /** Was der Browser hier zeigen kann: image | video | audio | pdf | text | null. */
  function previewKind() {
    const m = mimeOf();
    const bytes = meta.size || (opened && opened.size) || 0;
    if (/^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(m)) return 'image';
    if (m.startsWith('video/')) {
      return document.createElement('video').canPlayType(m) || m === 'video/quicktime' ? 'video' : null;
    }
    if (m.startsWith('audio/')) return document.createElement('audio').canPlayType(m) ? 'audio' : null;
    if (m === 'application/pdf') return navigator.pdfViewerEnabled ? 'pdf' : null;
    if ((m.startsWith('text/') || /^application\/(json|xml|x-yaml|yaml)$/.test(m)) && bytes <= TEXT_LIMIT) return 'text';
    return null;
  }

  const show = (section) => {
    for (const s of ['loading', 'error', 'password', 'file']) $(s).hidden = s !== section;
  };
  const fail = (text) => {
    $('error-text').textContent = text;
    show('error');
  };
  const size = (n) => {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB'];
    let v = n;
    let u = -1;
    do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
    return `${v.toLocaleString('de-DE', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[u]}`;
  };
  const date = (t) => new Date(t * 1000).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

  async function json(resp) {
    let data = {};
    try { data = await resp.json(); } catch (_) { /* leer */ }
    if (!resp.ok) {
      const err = new Error(data.error || `Fehler ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  /** Ticket + verschlüsselte Metadaten holen (zählt noch keinen Abruf). */
  async function openSend() {
    const body = auth ? { auth: PurpleSend.b64encode(auth) } : {};
    return json(await fetch(`${api}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    }));
  }

  function renderDetails() {
    const bits = [size(meta.size || opened.size), `bis ${date(opened.expires)}`];
    if (blob) {
      bits.push('geladen');
    } else if (opened.remaining != null) {
      bits.push(opened.remaining === 1 ? 'noch 1 Abruf' : `noch ${opened.remaining} Abrufe`);
    }
    $('details').textContent = bits.join(' · ');
  }

  function renderFile() {
    const kind = previewKind();
    $('name').textContent = meta.name || 'Datei';
    $('file-icon').innerHTML = ICONS[kind || (mimeOf() === 'application/pdf' ? 'pdf' : 'file')];
    renderDetails();
    if (meta.note) {
      $('note').textContent = meta.note;
      $('note').hidden = false;
    }
    $('view').hidden = !kind;
    $('view').querySelector('span').textContent = kind === 'audio' ? 'Anhören' : 'Ansehen';
    document.title = `${meta.name || 'Datei'} – NetPurple Send`;
    show('file');
  }

  async function unlocked(o) {
    try {
      meta = await PurpleSend.decryptMeta(k, o.meta, o.meta_iv);
    } catch (_) {
      throw new Error('Link ist beschädigt oder unvollständig.');
    }
    opened = o;
    renderFile();
  }

  async function start() {
    if (!id || !fragment) return fail('Der Link ist unvollständig – der Teil nach dem # fehlt.');
    if (!window.crypto || !crypto.subtle) return fail('Dieser Browser kann nicht entschlüsseln (WebCrypto fehlt).');
    try {
      info = await json(await fetch(api, { cache: 'no-store' }));
    } catch (e) {
      return fail(e.status === 404 ? 'Diese Freigabe gibt es nicht (mehr).' : e.message);
    }
    if (info.password) {
      show('password');
      $('pw').focus();
      return;
    }
    try {
      k = PurpleSend.fileKey(fragment);
      await unlocked(await openSend());
    } catch (e) {
      fail(e.message);
    }
  }

  $('password').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = $('pw-button');
    button.disabled = true;
    button.textContent = 'Wird geprüft …';
    $('pw-error').hidden = true;
    try {
      const keys = await PurpleSend.passwordKeys($('pw').value, info.salt, info.iterations);
      auth = keys.auth;
      k = PurpleSend.fileKey(fragment, keys.wrap);
      await unlocked(await openSend());
    } catch (e) {
      auth = null;
      $('pw-error').textContent = e.message;
      $('pw-error').hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Entsperren';
    }
  });

  async function fetchWithProgress(url, total) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) await json(resp);
    const reader = resp.body.getReader();
    const out = new Uint8Array(total);
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (got + value.length > out.length) throw new Error('Datei größer als erwartet');
      out.set(value, got);
      got += value.length;
      $('bar').style.width = `${Math.round((got / total) * 100)}%`;
    }
    if (got !== total) throw new Error('Download unvollständig – bitte erneut versuchen');
    return out;
  }

  const status = (text, isError = false) => {
    $('status').textContent = text;
    $('status').classList.toggle('error', isError);
    $('status').hidden = !text;
  };

  /**
   * Datei einmal holen und entschlüsseln (zählt einen Abruf). Danach liegt sie als Blob im Speicher –
   * Ansehen und Speichern holen sie nicht erneut. Ohne Laden geht es nicht: entschlüsselt wird nur
   * hier im Browser, der Server sieht die Datei nie im Klartext.
   */
  async function ensureBlob() {
    if (blob) return blob;
    $('progress').hidden = false;
    $('bar').style.width = '0';
    status('Wird geladen …');
    const o = await openSend();
    const cipher = await fetchWithProgress(`${api}/file?t=${encodeURIComponent(o.ticket)}`, o.size);
    status('Wird entschlüsselt …');
    const plain = await PurpleSend.decryptFile(k, meta, cipher);
    blob = new Blob([plain], { type: mimeOf() });
    opened = { ...o, remaining: o.remaining == null ? null : o.remaining - 1 };
    $('progress').hidden = true;
    status('');
    renderDetails();
    $('download').querySelector('span').textContent = 'Speichern';
    return blob;
  }

  let previewUrl = null;

  function renderPreview(kind) {
    const box = $('preview');
    box.textContent = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    const unsupported = () => {
      box.hidden = true;
      $('main').classList.remove('wide');
      status('Dieser Browser kann die Datei nicht anzeigen – bitte speichern.', true);
    };
    let el = null;
    if (kind === 'image') {
      el = document.createElement('img');
      el.alt = meta.name || '';
      el.onerror = unsupported;
    } else if (kind === 'video' || kind === 'audio') {
      el = document.createElement(kind);
      el.controls = true;
      el.playsInline = true;
      el.preload = 'metadata';
      el.onerror = unsupported;
    } else if (kind === 'pdf') {
      el = document.createElement('iframe');
      el.title = meta.name || 'PDF';
    } else {
      blob.slice(0, TEXT_LIMIT).text().then((t) => {
        const pre = document.createElement('pre');
        pre.textContent = t;
        box.appendChild(pre);
      });
    }
    if (el) {
      el.src = previewUrl;
      box.appendChild(el);
    }
    box.hidden = false;
    if (kind !== 'audio') $('main').classList.add('wide');
    if (kind === 'video' || kind === 'audio') el.play().catch(() => { /* Autoplay blockiert – Steuerung ist da */ });
    $('view').hidden = true;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function save() {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = meta.name || 'datei';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    $('view').disabled = true;
    $('download').disabled = true;
    try {
      await ensureBlob();
      action();
    } catch (e) {
      $('progress').hidden = true;
      status(e.message, true);
    } finally {
      busy = false;
      $('view').disabled = false;
      $('download').disabled = false;
    }
  }

  $('view').addEventListener('click', () => run(() => renderPreview(previewKind())));
  $('download').addEventListener('click', () => run(() => {
    save();
    status('Gespeichert.');
  }));

  // Hintergrund-Partikel wie auf netpurple.net (aus bei „Bewegung reduzieren“ und auf dem Handy).
  (() => {
    const canvas = $('bg-particles');
    if (!canvas) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 768px)').matches) {
      canvas.style.display = 'none';
      return;
    }
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const COLORS = ['#8B5CF6', '#3B82F6', '#8B5CF6'];
    const rand = (a, b) => Math.random() * (b - a) + a;
    let w = 0;
    let h = 0;
    let last = 0;
    const dots = [];
    const make = (anyY) => ({
      x: rand(0, w), y: anyY ? rand(0, h) : rand(-h * 0.1, -10), r: rand(0.6, 1.8), vy: rand(12, 38), vx: rand(-8, 8),
      c: COLORS[(Math.random() * COLORS.length) | 0], phase: rand(0, Math.PI * 2), tw: rand(1, 2.2),
    });
    function resize() {
      w = innerWidth;
      h = innerHeight;
      canvas.width = Math.max(1, Math.floor(w * DPR));
      canvas.height = Math.max(1, Math.floor(h * DPR));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const target = Math.min(260, Math.floor((w * h) / 9500));
      while (dots.length < target) dots.push(make(true));
      dots.length = target;
    }
    function step(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      ctx.clearRect(0, 0, w, h);
      for (const p of dots) {
        p.y += p.vy * dt;
        p.x += p.vx * dt;
        if (p.y - p.r > h) Object.assign(p, make(false));
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase + (ts / 1000) * p.tw));
        ctx.fillStyle = p.c;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(step);
    }
    addEventListener('resize', resize);
    resize();
    requestAnimationFrame(step);
  })();

  start();
}
