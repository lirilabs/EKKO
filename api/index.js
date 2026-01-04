const GH = "https://api.github.com";

/* ================= SAFE BODY ================= */
async function body(req) {
  if (req.method === "GET") return {};
  return new Promise(resolve => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

/* ================= GITHUB ================= */
async function gh(path, method = "GET", body) {
  const url =
    `${GH}/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}` +
    `/contents/data/${path}?ref=${process.env.GITHUB_BRANCH || "main"}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function load(name) {
  const f = await gh(name);
  return {
    data: JSON.parse(Buffer.from(f.content, "base64").toString("utf8")),
    sha: f.sha
  };
}

async function save(name, data, sha, msg) {
  await gh(name, "PUT", {
    message: msg,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
    sha,
    branch: process.env.GITHUB_BRANCH || "main"
  });
}

/* ================= RANKING ================= */
function computeScore(m, createdAt) {
  const hours = (Date.now() - createdAt) / 3600000;
  const freshness =
    hours < 1 ? 15 :
    hours < 6 ? 10 :
    hours < 24 ? 5 : 0;

  return (
    (m.likes || 0) * 3 +
    (m.shares || 0) * 5 +
    (m.comments || 0) * 4 +
    (m.plays || 0) * 0.5 +
    freshness
  );
}

/* ================= HANDLER ================= */
export default async function handler(req, res) {
  try {
    /* ---------- CORS ---------- */
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.end();

    const { action } = req.query;
    if (!action || action === "ping") {
      return res.json({ ok: true, time: Date.now() });
    }

    const b = await body(req);

    /* ---------- Normalize external fields ---------- */
    const userId  = b.user_id  || b.userId;
    const audioId = b.audio_id || b.audioId;
    const postId  = b.post_id  || b.postId;

    /* ---------- Load data ---------- */
    const users     = await load("users.json");
    const posts     = await load("posts.json");
    const audio     = await load("audio.json");
    const metrics   = await load("metrics.json");
    const relations = await load("relations.json");
    const indexes   = await load("indexes.json");
    const ranking   = await load("ranking.json");

    /* ================= USER CREATE ================= */
    if (action === "user:create") {
      const id = userId || "u_" + Date.now();

      users.data[id] = {
        id,
        name: b.name || "User",
        createdAt: Date.now(),
        preferences: { languages: {}, likedAudio: {} }
      };

      await save("users.json", users.data, users.sha, "user:create");
      return res.json({ ok: true, id });
    }

    /* ================= AUDIO CREATE ================= */
    if (action === "audio:create") {
      if (!b.id) {
        return res.json({ ok: false, error: "audio id required" });
      }

      audio.data[b.id] = b;
      await save("audio.json", audio.data, audio.sha, "audio:create");
      return res.json({ ok: true });
    }

    /* ================= POST CREATE ================= */
    if (action === "post:create") {
      if (!userId || !audioId || !b.clip) {
        return res.json({
          ok: false,
          error: "user_id, audio_id and clip are required"
        });
      }

      const id = "c_" + Date.now();

      posts.data[id] = {
        id,
        ownerId: userId,   // ✅ UID stored as owner
        audioId,
        clip: b.clip,
        createdAt: Date.now()
      };

      metrics.data.content[id] = {
        likes: 0,
        plays: 0,
        shares: 0,
        comments: 0
      };

      ranking.data[id] = { score: 0 };

      /* ---------- Indexes ---------- */
      indexes.data.feeds.latest.unshift(id);

      indexes.data.byUser[userId] ??= [];
      indexes.data.byUser[userId].unshift(id);

      indexes.data.byAudio ??= {};
      indexes.data.byAudio[audioId] ??= [];
      indexes.data.byAudio[audioId].unshift(id);

      const lang = audio.data[audioId]?.language;
      if (lang) {
        indexes.data.byLanguage[lang] ??= [];
        indexes.data.byLanguage[lang].unshift(id);
      }

      await save("posts.json", posts.data, posts.sha, "post:create");
      await save("metrics.json", metrics.data, metrics.sha, "metrics:init");
      await save("indexes.json", indexes.data, indexes.sha, "indexes:update");
      await save("ranking.json", ranking.data, ranking.sha, "ranking:init");

      return res.json({ ok: true, id });
    }

    /* ================= LIKE ================= */
    if (action === "post:like") {
      if (!userId || !postId) {
        return res.json({ ok: false, error: "user_id & post_id required" });
      }

      relations.data.likes[userId] ??= {};
      if (relations.data.likes[userId][postId]) {
        return res.json({ ok: false });
      }

      relations.data.likes[userId][postId] = true;
      metrics.data.content[postId].likes++;

      const m = metrics.data.content[postId];
      const p = posts.data[postId];
      ranking.data[postId].score = computeScore(m, p.createdAt);

      indexes.data.feeds.trending = Object.entries(ranking.data)
        .sort((a, b) => b[1].score - a[1].score)
        .map(e => e[0])
        .slice(0, 20);

      await save("relations.json", relations.data, relations.sha, "like");
      await save("metrics.json", metrics.data, metrics.sha, "metrics:like");
      await save("ranking.json", ranking.data, ranking.sha, "ranking:update");
      await save("indexes.json", indexes.data, indexes.sha, "trending:update");

      return res.json({ ok: true });
    }

    /* ================= FEEDS ================= */
    if (action === "feed:latest") {
      return res.json({
        ok: true,
        data: indexes.data.feeds.latest.map(id => ({
          ...posts.data[id],
          metrics: metrics.data.content[id],
          audio: audio.data[posts.data[id].audioId]
        }))
      });
    }

    if (action === "feed:trending") {
      return res.json({
        ok: true,
        data: indexes.data.feeds.trending.map(id => ({
          ...posts.data[id],
          metrics: metrics.data.content[id],
          audio: audio.data[posts.data[id].audioId]
        }))
      });
    }

    /* ================= SUGGEST ================= */
    if (action === "suggest") {
      const p = posts.data[postId];
      if (!p) return res.json({ ok: false, error: "post not found" });

      const sameAudio = indexes.data.byAudio[p.audioId] || [];
      const lang = audio.data[p.audioId]?.language;
      const sameLang = indexes.data.byLanguage[lang] || [];
      const trending = indexes.data.feeds.trending || [];

      const result = [...new Set([
        ...sameAudio,
        ...sameLang,
        ...trending
      ])]
        .filter(id => id !== postId)
        .slice(0, 10);

      return res.json({ ok: true, data: result });
    }

    return res.json({ ok: false, error: "Unknown action" });

  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
}
