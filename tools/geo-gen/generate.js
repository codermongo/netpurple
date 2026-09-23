/**
 * Writes crawlable static HTML for content the pages otherwise render via JS,
 * so search engines and AI crawlers (which mostly don't run JS) can read it.
 *
 *   node generate.js            # everything
 *   node generate.js sounds     # just one target (sounds | games)
 *
 * Output (committed to the repo):
 *   sound/index.html, games/index.html  – content between <!-- geo:… --> markers
 *   sound/<slug>/                       – one page per sound
 *   games/<slug>/                       – one page per game with a "description"
 *   sitemap.xml                         – entries between <!-- geo:sound|games --> markers
 *
 * No dependencies. Re-run whenever sounds.json or games.json changed.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");
const SITE = "https://netpurple.net";
const GENERATOR = "netpurple-geo-gen";
const RELATED_COUNT = 8;

/* ---------- helpers ---------- */

const esc = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const jsonLd = (data, indent) =>
  `${indent}<script type="application/ld+json">\n` +
  JSON.stringify(data, null, 2)
    .replace(/</g, "\\u003c")
    .split("\n")
    .map((line) => indent + line)
    .join("\n") +
  `\n${indent}</script>`;

function slugify(text) {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "item"
  );
}

function assignSlugs(items, getName, reserved) {
  const used = new Set(reserved);
  return items.map((item) => {
    const base = slugify(getName(item));
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

const safeColor = (value) =>
  /^#[0-9a-f]{3,8}$/i.test(value || "") ? value : "#8b5cf6";

/** Replace everything between <!-- geo:name --> and <!-- /geo:name -->. */
function fillMarker(source, name, content) {
  const re = new RegExp(`(<!-- geo:${name} -->)[\\s\\S]*?([ \\t]*<!-- /geo:${name} -->)`);
  if (!re.test(source)) throw new Error(`Marker geo:${name} not found`);
  return source.replace(re, (_, open, close) => `${open}\n${content}\n${close}`);
}

function updateFile(relPath, fills) {
  const path = join(REPO, relPath);
  let source = readFileSync(path, "utf8");
  for (const [name, content] of Object.entries(fills)) {
    source = fillMarker(source, name, content);
  }
  writeFileSync(path, source);
}

/** Date of the last commit touching relPath; today if it has uncommitted changes. */
function lastCommitDate(relPath) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  try {
    if (!git("status", "--porcelain", "--", relPath)) {
      const out = git("log", "-1", "--format=%cs", "--", relPath);
      if (out) return out;
    }
  } catch {
    /* not a git checkout */
  }
  return new Date().toISOString().slice(0, 10);
}

/** Delete generated page folders under `dir` whose slug is no longer in use. */
function removeStalePages(dir, keep) {
  const base = join(REPO, dir);
  let removed = 0;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    const page = join(base, entry.name, "index.html");
    if (!existsSync(page)) continue;
    if (!readFileSync(page, "utf8").includes(`content="${GENERATOR}"`)) continue;
    rmSync(join(base, entry.name), { recursive: true });
    removed += 1;
  }
  return removed;
}

const ANTI_FLASH =
  "<script>try{var d=localStorage;if(d.getItem('darkMode')==='true')document.body.classList.add('dark-mode');if(d.getItem('lowPowerMode')==='true'&&(d.getItem('lowPowerMobileOnly')!=='true'||matchMedia('(max-width:768px)').matches))document.body.classList.add('low-power-mode');}catch(e){}</script>";

/* ---------- sounds ---------- */

function soundFaq(total) {
  return [
    {
      q: "Is the NetPurple Soundboard free?",
      a: `Yes. All ${total} sounds are free to play, you don't need an account, and NetPurple shows no ads.`,
    },
    {
      q: "How do I use the soundboard?",
      a: "Click or tap a sound card to play it instantly. Use the search field to filter by name, “Play all” to queue every visible sound one after another, and “Stop” to end playback.",
    },
    {
      q: "Can I save my favorite sounds?",
      a: "Yes. With a free NetPurple account you can mark sounds with the heart icon; favorites are pinned to the top of the soundboard on every device you log in with.",
    },
    {
      q: "Does it work on phones and Chromebooks?",
      a: "Yes. The soundboard runs in any modern browser on desktop, Chromebook, tablet, and phone. Nothing to install.",
    },
  ];
}

function soundCardLink(sound, slug, indent) {
  return (
    `${indent}<a class="sound-card" href="/sound/${slug}/" style="--accent: ${safeColor(sound.color || sound.colr)}">` +
    `<span class="sound-chip"><span class="sound-icon"><i class="fa-solid fa-play" aria-hidden="true"></i></span></span>` +
    `<span class="sound-title">${esc(sound.name)}</span>` +
    `<span class="sound-caption">Open sound</span></a>`
  );
}

function soundPage(sound, slug, related, total) {
  const url = `${SITE}/sound/${slug}/`;
  const mp3 = `/sound/${encodeURI(sound.mp3)}`;
  const title = `${sound.name} Sound Effect | NetPurple Soundboard`;
  const description = `Play the “${sound.name}” sound effect instantly in your browser. Free, no signup, no ads. Part of the NetPurple Soundboard with ${total} meme sounds and sound effects.`;
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "AudioObject",
      name: sound.name,
      description,
      contentUrl: `${SITE}${mp3}`,
      encodingFormat: "audio/mpeg",
      url,
      isAccessibleForFree: true,
      isPartOf: { "@type": "WebPage", name: "NetPurple Soundboard", url: `${SITE}/sound/` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "NetPurple", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Soundboard", item: `${SITE}/sound/` },
        { "@type": "ListItem", position: 3, name: sound.name, item: url },
      ],
    },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="darkreader-lock">
    <meta name="generator" content="${GENERATOR}">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <link rel="canonical" href="${url}">
    <meta name="theme-color" content="#121224">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/sound/css/styles.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="NetPurple">
    <meta property="og:locale" content="en_US">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${SITE}/logo.png">
    <meta property="og:audio" content="${SITE}${mp3}">
    <meta property="og:audio:type" content="audio/mpeg">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${SITE}/logo.png">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
${jsonLd(data, "    ")}
</head>
<body data-auth="out">
    ${ANTI_FLASH}

    <canvas id="bg-particles" aria-hidden="true"></canvas>

    <main class="page">
        <section class="hero">
            <div class="hero-content">
                <div class="hero-logo">
                    <div class="logo-geometric"></div>
                </div>
                <h1 class="hero-title">${esc(sound.name)}</h1>
                <p class="hero-subtitle">Sound effect from the NetPurple Soundboard. Press play to listen.</p>
                <audio class="sound-player" controls preload="none" src="${mp3}"></audio>
                <div class="hero-actions">
                    <a class="btn-primary" href="/sound/">Open the Soundboard</a>
                    <a class="btn-secondary" href="/">Back to NetPurple</a>
                </div>
            </div>
        </section>

        <section class="soundboard">
            <div class="sound-info">
                <h2>More sounds</h2>
            </div>
            <div class="sound-grid">
${related.map(({ sound: s, slug: sl }) => soundCardLink(s, sl, "                ")).join("\n")}
            </div>
        </section>

        <section class="sound-info">
            <h2>About this sound</h2>
            <p>“${esc(sound.name)}” is one of ${total} free meme sounds and sound effects on the <a href="/sound/">NetPurple Soundboard</a>. Play it right here or open the full soundboard to search, queue, and favorite sounds. No signup and no ads.</p>
        </section>
    </main>

    <footer class="footer">NetPurple Soundboard · <a href="/sound/">All sounds</a></footer>

    <script src="/particles.js"></script>
    <script src="/config.js"></script>
</body>
</html>
`;
}

function buildSounds() {
  const { sounds = [] } = JSON.parse(readFileSync(join(REPO, "sound/sounds.json"), "utf8"));
  // Folders that already exist under /sound/ and must never be used as a slug.
  const slugs = assignSlugs(sounds, (s) => s.name, ["css", "img", "sounds"]);
  const entries = sounds.map((sound, i) => ({ sound, slug: slugs[i] }));
  const total = sounds.length;
  const faq = soundFaq(total);

  // Per-sound pages; "related" = the next sounds in list order, so every page is linked.
  entries.forEach(({ sound, slug }, i) => {
    const related = [];
    for (let k = 1; k <= Math.min(RELATED_COUNT, total - 1); k += 1) {
      related.push(entries[(i + k) % total]);
    }
    const dir = join(REPO, "sound", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), soundPage(sound, slug, related, total));
  });
  const removed = removeStalePages("sound", new Set(slugs));

  // Soundboard page: static card list, about/FAQ text, JSON-LD.
  const list = entries
    .map(({ sound, slug }) => soundCardLink(sound, slug, "                    "))
    .join("\n");

  const about = `        <section class="sound-info" id="about">
            <h2>About the NetPurple Soundboard</h2>
            <p>The NetPurple Soundboard is a free online soundboard with ${total} meme sounds and sound effects, from viral meme clips to game, TV, and notification sounds. Every sound plays instantly in the browser. No download, no signup, no ads.</p>
            <h2>FAQ</h2>
${faq.map(({ q, a }) => `            <h3>${esc(q)}</h3>\n            <p>${esc(a)}</p>`).join("\n")}
        </section>`;

  const data = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "NetPurple Soundboard",
      url: `${SITE}/sound/`,
      description: `Free online soundboard with ${total} meme sounds and sound effects. No signup, no ads.`,
      isPartOf: { "@type": "WebSite", name: "NetPurple", url: `${SITE}/` },
      mainEntity: {
        "@type": "ItemList",
        name: "Sounds",
        numberOfItems: total,
        itemListElement: entries.map(({ sound, slug }, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: sound.name,
          url: `${SITE}/sound/${slug}/`,
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  updateFile("sound/index.html", {
    jsonld: jsonLd(data, "    "),
    list,
    about,
  });

  const lastmod = lastCommitDate("sound/sounds.json");
  updateFile("sitemap.xml", {
    sound: entries
      .map(
        ({ slug }) =>
          `  <url>\n    <loc>${SITE}/sound/${slug}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`
      )
      .join("\n"),
  });

  console.log(`sounds: ${total} pages written, ${removed} stale removed`);
}

/* ---------- games ---------- */

// Only games with a description (games.json "description") get their own page;
// the rest are listed on /games/ and link straight to the game.
const GAME_EXAMPLES = ["2048", "Cut the Rope", "Flappy Bird", "Minecraft Classic", "Wordle"];

function gameFaq(total) {
  return [
    {
      q: "Are the games on NetPurple free?",
      a: `Yes. All ${total} games are free to play, you don't need an account, and there are no ads.`,
    },
    {
      q: "Do I need to download or install anything?",
      a: "No. Every game runs directly in the browser. Open it and start playing.",
    },
    {
      q: "Can I play on a Chromebook or phone?",
      a: "Yes on Chromebooks and any modern desktop browser. The site also works on phones and tablets, but many games need a keyboard.",
    },
    {
      q: "Can I save favorite games?",
      a: "Yes. With a free NetPurple account you can mark games with the heart icon; favorites are pinned to the top of the list. The “Random game” button picks something for you.",
    },
  ];
}

function gameCardLink(game, href, caption, indent) {
  return (
    `${indent}<a class="game-card" href="${esc(href)}">` +
    `<img class="game-thumb" src="/games/${esc(encodeURI(game.imgSrc))}" alt="${esc(game.title)} cover" loading="lazy">` +
    `<div class="game-body"><div class="game-title">${esc(game.title)}</div>` +
    `<div class="game-meta-row">${caption}</div></div></a>`
  );
}

function gamePage(game, slug, related, total) {
  const url = `${SITE}/games/${slug}/`;
  const play = `/games/${encodeURI(game.link)}`;
  const image = `${SITE}/games/${encodeURI(game.imgSrc)}`;
  const title = `${game.title}: Play Free Online | NetPurple Games`;
  const description = `${game.description} Play ${game.title} free in your browser. No download, no signup.`;
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: game.title,
      description: game.description,
      url,
      image,
      gamePlatform: "Web browser",
      applicationCategory: "Game",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      isPartOf: { "@type": "WebPage", name: "NetPurple Games", url: `${SITE}/games/` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "NetPurple", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Games", item: `${SITE}/games/` },
        { "@type": "ListItem", position: 3, name: game.title, item: url },
      ],
    },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="darkreader-lock">
    <meta name="generator" content="${GENERATOR}">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <link rel="canonical" href="${url}">
    <meta name="theme-color" content="#121224">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/games/games.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="NetPurple">
    <meta property="og:locale" content="en_US">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${esc(image)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${esc(image)}">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
${jsonLd(data, "    ")}
</head>
<body data-auth="out">
    ${ANTI_FLASH}

    <canvas id="bg-particles" aria-hidden="true"></canvas>

    <section class="hero hero-games">
        <div class="hero-content">
            <div class="hero-logo">
                <div class="logo-geometric"></div>
            </div>
            <h1 class="hero-title">${esc(game.title)}</h1>
            <img class="game-detail-cover" src="/games/${esc(encodeURI(game.imgSrc))}" alt="${esc(game.title)} cover">
            <p class="game-detail-text">${esc(game.description)}</p>
            <div class="hero-buttons">
                <a class="btn-primary" href="${esc(play)}">Play ${esc(game.title)}</a>
                <a class="btn-secondary" href="/games/">All games</a>
            </div>
        </div>
    </section>

    <section class="games-section">
        <div class="container">
            <div class="games-info">
                <h2>More games</h2>
            </div>
            <div class="games-grid">
${related.map(({ game: g, slug: sl }) => gameCardLink(g, `/games/${sl}/`, "Details", "                ")).join("\n")}
            </div>
        </div>
    </section>

    <section class="games-info">
        <h2>About ${esc(game.title)}</h2>
        <p>${esc(game.title)} is one of ${total} free browser games on <a href="/games/">NetPurple Games</a>. It runs directly in your browser. No download, no signup, no ads.</p>
    </section>

    <script src="/particles.js"></script>
    <script src="/config.js"></script>
</body>
</html>
`;
}

function buildGames() {
  const games = JSON.parse(readFileSync(join(REPO, "games/config/games.json"), "utf8"));
  const total = games.length;
  const described = games.filter((g) => g.description);
  const slugs = assignSlugs(described, (g) => g.title, ["config", "js", "projects"]);
  const pages = described.map((game, i) => ({ game, slug: slugs[i] }));
  const slugOf = new Map(pages.map(({ game, slug }) => [game, slug]));
  const hrefOf = (game) =>
    slugOf.has(game) ? `/games/${slugOf.get(game)}/` : `/games/${encodeURI(game.link)}`;
  const faq = gameFaq(total);

  pages.forEach(({ game, slug }, i) => {
    const related = [];
    for (let k = 1; k <= Math.min(RELATED_COUNT, pages.length - 1); k += 1) {
      related.push(pages[(i + k) % pages.length]);
    }
    const dir = join(REPO, "games", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), gamePage(game, slug, related, total));
  });
  const removed = removeStalePages("games", new Set(slugs));

  const list = games
    .map((game) =>
      gameCardLink(game, hrefOf(game), slugOf.has(game) ? "Details" : "Play now", "                ")
    )
    .join("\n");

  const titles = new Set(games.map((g) => g.title));
  const examples = GAME_EXAMPLES.filter((t) => titles.has(t));
  const about = `    <section class="games-info" id="about">
        <h2>About NetPurple Games</h2>
        <p>NetPurple Games is a free collection of ${total} browser games${examples.length ? `, including ${examples.map(esc).join(", ")}` : ""}. Puzzle, racing, platformer, idle and multiplayer games all run directly in the browser. No download, no signup, no ads.</p>
        <h2>FAQ</h2>
${faq.map(({ q, a }) => `        <h3>${esc(q)}</h3>\n        <p>${esc(a)}</p>`).join("\n")}
    </section>`;

  const data = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "NetPurple Games",
      url: `${SITE}/games/`,
      description: `Free collection of ${total} browser games. No download, no signup, no ads.`,
      isPartOf: { "@type": "WebSite", name: "NetPurple", url: `${SITE}/` },
      mainEntity: {
        "@type": "ItemList",
        name: "Games",
        numberOfItems: total,
        itemListElement: games.map((game, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: game.title,
          url: `${SITE}${hrefOf(game)}`,
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  updateFile("games/index.html", {
    jsonld: jsonLd(data, "    "),
    list,
    about,
  });

  const lastmod = lastCommitDate("games/config/games.json");
  updateFile("sitemap.xml", {
    games: pages
      .map(
        ({ slug }) =>
          `  <url>\n    <loc>${SITE}/games/${slug}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
      )
      .join("\n"),
  });

  console.log(`games: ${total} listed, ${pages.length} pages written, ${removed} stale removed`);
}

/* ---------- main ---------- */

const TARGETS = { sounds: buildSounds, games: buildGames };
const requested = process.argv.slice(2);
const run = requested.length ? requested : Object.keys(TARGETS);

for (const name of run) {
  if (!TARGETS[name]) {
    console.error(`Unknown target "${name}". Available: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }
  TARGETS[name]();
}
