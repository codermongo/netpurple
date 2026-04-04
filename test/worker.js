export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // -------------------- Config --------------------
    const allowedOrigins = new Set([
      "https://netpurple.net",
      "https://www.netpurple.net",
    ]);

    // Appwrite
    const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
    const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
    const APPWRITE_DATABASE_ID = "699f251000346ad6c5e7";

    // Collections
    const ANIME_COLLECTION_ID = "anime_ranking_1";
    const TOOLS_COLLECTION_ID = "tools";
    const LIST_COLLECTION_ID = "list";

    // TTL
    const TTL_APPWRITE_SECONDS = 300;       // 5 minutes

    // Cache key namespace — bump to bust all Appwrite cache entries instantly
    const APPWRITE_CACHE_NS = "v2";

    // Secrets
    const BYPASS_TOKEN = env.BYPASS_TOKEN || "CHANGE_ME";
    const APPWRITE_API_KEY = env.APPWRITE_API_KEY || "";

    const origin = request.headers.get("Origin");
    const corsOrigin = origin && allowedOrigins.has(origin) ? origin : "https://netpurple.net";

    const corsBaseHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // -------------------- Preflight / Origin Guard --------------------
    if (request.method === "OPTIONS") {
      if (origin && !allowedOrigins.has(origin)) {
        return new Response(null, { status: 403, headers: corsBaseHeaders });
      }
      return new Response(null, { headers: corsBaseHeaders });
    }

    if (origin && !allowedOrigins.has(origin)) {
      return json({ error: "Unauthorized origin" }, 403, corsBaseHeaders);
    }

    const cache = caches.default;

    // -------------------- Helpers --------------------
    function json(obj, status = 200, extraHeaders = {}) {
      return new Response(JSON.stringify(obj), {
        status,
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
        },
      });
    }

    function withCors(resp) {
      const r = new Response(resp.body, resp);
      r.headers.set("Access-Control-Allow-Origin", corsOrigin);
      return r;
    }

    function cacheable(resp, ttlSeconds, extraHeaders = {}) {
      const r = new Response(resp.body, resp);
      r.headers.set("Cache-Control", `public, s-maxage=${ttlSeconds}, max-age=${ttlSeconds}`);
      r.headers.set("Access-Control-Allow-Origin", corsOrigin);
      for (const [k, v] of Object.entries(extraHeaders)) {
        r.headers.set(k, v);
      }
      return r;
    }

    async function fetchJsonOrText(response) {
      const ct = response.headers.get("content-type") || "";
      if (ct.includes("application/json")) return await response.json();
      return await response.text();
    }

    function normalizePath(pathname) {
      return pathname.replace(/\/+$/, "");
    }

    async function cacheGetOrSet({ cacheKeyUrl, ttlSeconds, bypass, purge, fetcher }) {
      const cacheKey = new Request(cacheKeyUrl, request);

      if (purge) {
        const deleted = await cache.delete(cacheKey);
        return json({ ok: true, purged: deleted }, 200, corsBaseHeaders);
      }

      if (!bypass) {
        const hit = await cache.match(cacheKey);
        if (hit) return withCors(hit);
      }

      const liveResponse = await fetcher();
      if (!(liveResponse instanceof Response)) {
        return json({ error: "Internal fetcher error" }, 500, corsBaseHeaders);
      }

      if (!liveResponse.ok) return withCors(liveResponse);

      const cached = cacheable(liveResponse, ttlSeconds);
      ctx.waitUntil(cache.put(cacheKey, cached.clone()));
      return cached;
    }

    async function fetchAllAppwriteDocuments(collectionId) {
      const baseUrl = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/collections/${collectionId}/documents`;
      const headers = {
        "X-Appwrite-Project": APPWRITE_PROJECT_ID,
        "Content-Type": "application/json",
      };
      if (APPWRITE_API_KEY) headers["X-Appwrite-Key"] = APPWRITE_API_KEY;

      let all = [];
      let offset = 0;
      const limit = 100;
      let total = 0;

      while (true) {
        const pageUrl = `${baseUrl}?queries[]=limit(${limit})&queries[]=offset(${offset})`;
        const res = await fetch(pageUrl, { method: "GET", headers });

        if (!res.ok) {
          if (offset === 0) {
            const plain = await fetch(baseUrl, { method: "GET", headers });
            if (!plain.ok) {
              const body = await fetchJsonOrText(plain);
              return json({ error: "Appwrite error", status: plain.status, body }, plain.status, corsBaseHeaders);
            }
            const first = await plain.json();
            const docs = Array.isArray(first?.documents) ? first.documents : [];
            total = Number(first?.total ?? docs.length);
            return json({ total, documents: docs }, 200, corsBaseHeaders);
          }

          const body = await fetchJsonOrText(res);
          return json({ error: "Appwrite error", status: res.status, body }, res.status, corsBaseHeaders);
        }

        const page = await res.json();
        const docs = Array.isArray(page?.documents) ? page.documents : [];
        total = Number(page?.total ?? docs.length);

        all = all.concat(docs);
        offset += docs.length;

        if (docs.length === 0) break;
        if (all.length >= total) break;
      }

      return json({ total: total, documents: all }, 200, corsBaseHeaders);
    }

    // -------------------- Routing --------------------
    const path = normalizePath(url.pathname);

    // Appwrite: /appwrite/anime | /appwrite/tools | /appwrite/list
    if (path.startsWith("/appwrite/")) {
      const bypass = url.searchParams.get("bypass") === BYPASS_TOKEN;
      const purge = url.searchParams.get("purge") === BYPASS_TOKEN;

      let collectionId = null;
      if (path === "/appwrite/anime") collectionId = ANIME_COLLECTION_ID;
      if (path === "/appwrite/tools") collectionId = TOOLS_COLLECTION_ID;
      if (path === "/appwrite/list") collectionId = LIST_COLLECTION_ID;

      if (!collectionId) {
        return json(
          { error: "Unknown route. Use /appwrite/anime, /appwrite/tools, /appwrite/list" },
          404,
          corsBaseHeaders
        );
      }

      // Namespace in cache key ensures old stale entries are never matched
      const cacheKeyUrl = `https://cache.netpurple.local/${APPWRITE_CACHE_NS}${path}`;

      return cacheGetOrSet({
        cacheKeyUrl,
        ttlSeconds: TTL_APPWRITE_SECONDS,
        bypass,
        purge,
        fetcher: async () => fetchAllAppwriteDocuments(collectionId),
      });
    }

    return json({ error: "Route not found" }, 404, corsBaseHeaders);
  },
};
