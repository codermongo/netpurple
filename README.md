# NetPurple

**[netpurple.net](https://www.netpurple.net)** — A personal web hub with browser games, a soundboard, tier lists, curated resources, and more.

---

## Features

### 🎮 Games — `/games`
Browse and play **145 browser games** from the [3kh0-lite](https://github.com/3kh0/3kh0-lite) collection. Includes real-time search, a random game picker, and a favourites system for logged-in users.

### 🔊 Soundboard — `/sound`
Play, search, and queue **208 meme and effect sounds** instantly. Supports play-all, stop, real-time search, and per-sound favourites when logged in.

### 📊 Tier Lists — `/tier`
Personal rankings for **Anime**, **Series**, and **Games**, grouped into tiers (Best of All Time → -F). Within each tier entries are ranked left to right. Supports flexible export:
- **Content:** Only Names · Names + Ranking · Names + Notes · Names + Ranking + Notes
- **Format:** JSON · CSV · TXT

### 🔗 Free Stuff — `/list`
A searchable list of curated free web resources — games, streaming links, and more, organised by category.

### 🛠️ Tools — `/tools`
A curated collection of utility and productivity tools covering privacy, self-hosting, platform-specific resources, and more.

### 🎬 Hub — `/hub`
A searchable video collection with filters and sortable metadata.

### 🔐 Auth — `/login`
Account system powered by Appwrite. Login unlocks favourites across Games and Soundboard.

### 📖 Documentation
Full documentation at **[docu.netpurple.net](https://docu.netpurple.net)** — built with Docusaurus.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML · CSS · Vanilla JavaScript |
| Auth & Database | [Appwrite](https://appwrite.io) |
| Icons | [Font Awesome 6](https://fontawesome.com) |
| Fonts | [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts |
| Background | Custom particle canvas (`particles.js`) |
| Documentation | [Docusaurus 3](https://docusaurus.io) |
| Game content | [3kh0-lite](https://github.com/3kh0/3kh0-lite) |

No frameworks, no build step for the main site — just static files served directly.

---

## Project Structure

```
netpurple/
├── index.html        # Homepage
├── style.css         # Global styles
├── particles.js      # Background particle effect
├── auth.js           # Appwrite auth helper
├── menu.js           # Shared nav/menu logic
├── games/            # Browser games hub
├── sound/            # Soundboard
├── tier/             # Tier lists (anime / series / games)
├── list/             # Free stuff directory
├── tools/            # Curated tools
├── hub/              # Video collection
├── login/            # Login page
└── user/             # User profile
```

---

## License

This project is licensed under **The Unlicense**.

This means the code is dedicated to the public domain. You are free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means.

**In short: You can do whatever you want with this code.**

See [UNLICENSE](https://unlicense.org) for the full text.
