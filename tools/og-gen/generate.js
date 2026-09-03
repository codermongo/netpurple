/**
 * Generates static Open Graph preview images for the three curated tierlists.
 *
 *   node generate.js            # all three
 *   node generate.js games      # just one
 *
 * Output: ../../tier/<cat>/og.png  (1200x630, committed to the repo)
 *
 * Data source: the same public Appwrite collections the pages read
 * (read("any"), no key). Re-run whenever a list changed materially.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");

const APPWRITE = "https://api.netpurple.net/v1";
const PROJECT = "699f23920000d9667d3e";
const DB = "699f251000346ad6c5e7";

const LISTS = {
  anime: { collection: "anime_ranking_1", title: "Anime" },
  games: { collection: "69e882d50014dcc8582c", title: "Games" },
  series: { collection: "6a02d598001305384d8b", title: "Series" },
};

const TIER_ORDER = ["Best of All Time", "S", "A", "B", "C", "D", "E", "F", "-F"];
const TIER_LABEL = { "Best of All Time": "BEST", "-F": "-F" };
const TIER_COLORS = {
  "Best of All Time": { bg: "#1a0000", fg: "#ef4444", ring: "#ef4444" },
  S: { bg: "#e83030", fg: "#ffffff" },
  A: { bg: "#e87020", fg: "#1a0800" },
  B: { bg: "#d4b800", fg: "#1a0800" },
  C: { bg: "#4caf20", fg: "#0a1a00" },
  D: { bg: "#1090d0", fg: "#001a2a" },
  E: { bg: "#7040b8", fg: "#ffffff" },
  F: { bg: "#686868", fg: "#f0f0f0" },
  "-F": { bg: "#383838", fg: "#a0a0a0" },
};

const W = 1200;
const H = 630;
const PAD = 40;
const HEADER_H = 76;
const ROW_GAP = 10;
const LABEL_W = 80;
const COVER_GAP = 6;
const COVER_RATIO = 0.72; // width / height
const ROW_H_MAX = 150;

/* ---------- data ---------- */

async function fetchAll(collection) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const queries = [{ method: "limit", values: [100] }];
    if (cursor) queries.push({ method: "cursorAfter", values: [cursor] });
    const qs = queries
      .map((q) => "queries[]=" + encodeURIComponent(JSON.stringify(q)))
      .join("&");
    const res = await fetch(
      `${APPWRITE}/databases/${DB}/collections/${collection}/documents?${qs}`,
      { headers: { "X-Appwrite-Project": PROJECT } }
    );
    if (!res.ok) throw new Error(`Appwrite ${res.status} for ${collection}`);
    const json = await res.json();
    const docs = json.documents || [];
    out.push(...docs);
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1].$id;
  }
  return out;
}

function groupByTier(docs) {
  const groups = new Map();
  for (const d of docs) {
    const tier = TIER_ORDER.includes(d.tier) ? d.tier : null;
    if (!tier) continue;
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier).push(d);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const pa = a.tier_position ?? Infinity;
      const pb = b.tier_position ?? Infinity;
      if (pa !== pb) return pa - pb;
      return String(a.title).localeCompare(String(b.title));
    });
  }
  return TIER_ORDER.filter((t) => groups.has(t)).map((t) => ({
    tier: t,
    items: groups.get(t),
  }));
}

/* ---------- cover fetching ---------- */

const SIG = [
  [[0x89, 0x50, 0x4e, 0x47], "image/png"],
  [[0xff, 0xd8, 0xff], "image/jpeg"],
];
function sniffMime(buf) {
  for (const [sig, mime] of SIG) {
    if (sig.every((b, i) => buf[i] === b)) return mime;
  }
  if (buf.slice(0, 4).toString("ascii") === "RIFF" &&
      buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

async function fetchCover(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "netpurple-og-gen" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = sniffMime(buf);
    if (!mime || mime === "image/webp") return null; // satori: png/jpg only
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await worker(items[idx], idx);
      }
    })
  );
  return results;
}

/* ---------- layout (satori element tree) ---------- */

const h = (type, style, children) => ({
  type,
  props: { style, ...(children !== undefined ? { children } : {}) },
});

const img = (src, w, hgt, extraStyle = {}) => ({
  type: "img",
  props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...extraStyle } },
});

function initials(title) {
  const words = String(title).replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  return ((words[0]?.[0] || "") + (words[1]?.[0] || words[0]?.[1] || "")).toUpperCase();
}

function coverEl(item, coverW, coverH, tierColor) {
  const src = item._cover;
  if (src) {
    return img(src, coverW, coverH, { borderRadius: 6, objectFit: "cover" });
  }
  return h(
    "div",
    {
      display: "flex",
      width: coverW,
      height: coverH,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      background: "#20202e",
      border: "1px solid rgba(255,255,255,0.08)",
      color: "rgba(255,255,255,0.5)",
      fontSize: Math.max(12, Math.round(coverH * 0.28)),
      fontWeight: 700,
    },
    initials(item.title)
  );
}

function buildTree(categoryTitle, rows, totalCount) {
  const bodyH = H - PAD * 2 - HEADER_H - 24; // 24 = divider + margins
  // Keep covers legible: show only as many tiers as fit at a sane min height,
  // the rest get summarised in a chip. Curated lists are top-heavy anyway.
  const MIN_ROW_H = 82;
  const maxRows = Math.max(4, Math.floor((bodyH + ROW_GAP) / (MIN_ROW_H + ROW_GAP)));
  const visibleRows = rows.slice(0, maxRows);
  const hiddenTiers = rows.slice(maxRows);
  const n = visibleRows.length;
  const chipReserve = hiddenTiers.length ? 26 : 0;
  const rowH = Math.max(
    44,
    Math.min(ROW_H_MAX, Math.floor((bodyH - chipReserve - (n - 1) * ROW_GAP) / n))
  );
  const coverH = rowH;
  const coverW = Math.round(coverH * COVER_RATIO);
  const stripW = W - PAD * 2 - LABEL_W - 12;
  const fit = Math.max(3, Math.floor((stripW + COVER_GAP) / (coverW + COVER_GAP)));

  const rowEls = visibleRows.map(({ tier, items }) => {
    const color = TIER_COLORS[tier];
    let shown = items;
    let overflow = 0;
    if (items.length > fit) {
      shown = items.slice(0, fit - 1);
      overflow = items.length - shown.length;
    }
    const covers = shown.map((it) => coverEl(it, coverW, coverH, color));
    if (overflow > 0) {
      covers.push(
        h(
          "div",
          {
            display: "flex",
            width: coverW,
            height: coverH,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.75)",
            fontSize: Math.max(13, Math.round(coverH * 0.24)),
            fontWeight: 700,
          },
          `+${overflow}`
        )
      );
    }
    return h("div", { display: "flex", alignItems: "center", gap: 12, height: rowH }, [
      h(
        "div",
        {
          display: "flex",
          width: LABEL_W,
          height: rowH,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          background: color.bg,
          color: color.fg,
          fontSize: Math.min(22, Math.round(rowH * 0.42)),
          fontWeight: 700,
          ...(color.ring ? { border: `2px solid ${color.ring}` } : {}),
        },
        TIER_LABEL[tier] || tier
      ),
      h("div", { display: "flex", gap: COVER_GAP, overflow: "hidden", flex: 1 }, covers),
    ]);
  });

  if (hiddenTiers.length) {
    rowEls.push(
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          marginTop: 2,
          fontSize: 15,
          color: "#8b8fa3",
        },
        `+ ${hiddenTiers.map((r) => TIER_LABEL[r.tier] || r.tier).join(" · ")}`
      )
    );
  }

  const logo = readFileSync(resolve(REPO, "logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: W,
      height: H,
      padding: PAD,
      background: "linear-gradient(135deg, #0b0b16 0%, #14142b 60%, #1b1140 100%)",
      fontFamily: "Inter",
    },
    [
      // header
      h("div", { display: "flex", alignItems: "center", height: HEADER_H }, [
        img(logoSrc, 56, 56, { borderRadius: 12 }),
        h(
          "div",
          { display: "flex", flexDirection: "column", marginLeft: 18, flex: 1 },
          [
            h("div", { display: "flex", fontSize: 34, fontWeight: 700 }, [
              h("span", { color: "#ffffff" }, `${categoryTitle} `),
              h("span", { color: "#a78bfa" }, "Tierlist"),
            ]),
            h(
              "div",
              { display: "flex", fontSize: 15, color: "#9aa0b4", marginTop: 2 },
              `netpurple.net  ·  ${totalCount} Einträge`
            ),
          ]
        ),
      ]),
      // gradient divider
      h("div", {
        display: "flex",
        height: 3,
        marginTop: 6,
        marginBottom: 15,
        borderRadius: 2,
        background: "linear-gradient(90deg, #8b5cf6, #3b82f6)",
      }),
      // rows
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          gap: ROW_GAP,
          flex: 1,
          justifyContent: "center",
        },
        rowEls
      ),
    ]
  );
}

/* ---------- main ---------- */

async function loadFonts() {
  const base = resolve(__dirname, "node_modules/@fontsource/inter/files");
  const f = (w) => readFileSync(resolve(base, `inter-latin-${w}-normal.woff`));
  return [
    { name: "Inter", data: f(400), weight: 400, style: "normal" },
    { name: "Inter", data: f(600), weight: 600, style: "normal" },
    { name: "Inter", data: f(700), weight: 700, style: "normal" },
  ];
}

async function generate(cat, fonts) {
  const { collection, title } = LISTS[cat];
  process.stdout.write(`[${cat}] fetching… `);
  const docs = await fetchAll(collection);
  const rows = groupByTier(docs);
  const ranked = rows.reduce((s, r) => s + r.items.length, 0);
  process.stdout.write(`${docs.length} docs, ${rows.length} tiers, ${ranked} ranked; covers… `);

  const flat = rows.flatMap((r) => r.items);
  await pool(flat, 8, async (it) => {
    if (it.cover_url) it._cover = await fetchCover(it.cover_url);
    return null;
  });
  const withCover = flat.filter((it) => it._cover).length;
  process.stdout.write(`${withCover}/${flat.length}; rendering… `);

  const tree = buildTree(title, rows, ranked);
  const svg = await satori(tree, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } })
    .render()
    .asPng();

  const outPath = resolve(REPO, "tier", cat, "og.png");
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${(png.length / 1024).toFixed(0)} KB)`);
}

const targets = process.argv.slice(2).filter((a) => LISTS[a]);
const run = targets.length ? targets : Object.keys(LISTS);
const fonts = await loadFonts();
for (const cat of run) {
  try {
    await generate(cat, fonts);
  } catch (e) {
    console.error(`[${cat}] FAILED:`, e.message);
    process.exitCode = 1;
  }
}
