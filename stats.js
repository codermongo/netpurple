(function () {
  const STATS_URL = "/stats.json";
  const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
  const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
  const APPWRITE_DATABASE_ID = "699f251000346ad6c5e7";
  const ENTRY_COLLECTION_IDS = ["anime_ranking_1", "6a02d598001305384d8b", "69e882d50014dcc8582c"];

  function formatNumber(value) {
    return new Intl.NumberFormat("de-DE").format(value);
  }

  function setStat(name, value) {
    const el = document.querySelector(`.infos-value[data-stat="${name}"]`);
    if (el) el.textContent = formatNumber(value);
  }

  async function loadRepoStats() {
    try {
      const response = await fetch(STATS_URL, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data.lines_of_code === "number") setStat("loc", data.lines_of_code);
      if (typeof data.files === "number") setStat("files", data.files);
      if (typeof data.commits === "number") setStat("commits", data.commits);
    } catch (error) {
      // Placeholder stays visible if the stats file is unavailable.
    }
  }

  async function loadEntryCount() {
    if (typeof Appwrite === "undefined") return;
    try {
      const { Client, Databases, Query } = Appwrite;
      const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
      const databases = new Databases(client);
      const totals = await Promise.all(
        ENTRY_COLLECTION_IDS.map((collectionId) =>
          databases.listDocuments(APPWRITE_DATABASE_ID, collectionId, [Query.limit(1)])
        )
      );
      const total = totals.reduce((sum, result) => sum + (result?.total || 0), 0);
      setStat("entries", total);
    } catch (error) {
      // Placeholder stays visible if Appwrite is unreachable.
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.querySelector(".infos-stats")) return;
    void loadRepoStats();
    void loadEntryCount();
  });
})();
