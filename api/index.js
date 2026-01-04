const GH = "https://api.github.com";

/* ---------------- SAFE BODY ---------------- */
async function body(req) {
  if (req.method === "GET") return {};
  const len = Number(req.headers["content-length"] || 0);
  if (!len) return {};
  return new Promise(r => {
    let d = "";
    req.on("data", c => (d += c));
    req.on("end", () => {
      try { r(JSON.parse(d)); } catch { r({}); }
    });
  });
}

/* ---------------- GITHUB ---------------- */
async function gh(path, method="GET", body) {
  const url = `${GH}/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}/contents/data/${path}?ref=${process.env.GITHUB_BRANCH || "main"}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
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
    content: Buffer.from(JSON.stringify(data)).toString("base64"),
    sha,
    branch: process.env.GITHUB_BRANCH || "main"
  });
}

/* ---------------- RANKING ---------------- */
function computeScore(m, createdAt) {
  const h = (Date.now() - createdAt) / 3600000;
  const freshness = h < 1 ? 15 : h < 6 ? 10 : h < 24 ? 5 : 0;
  return (
    (m.likes || 0) * 3 +
    (m.shares || 0) * 5 +
    (m.comments || 0) * 4 +
    (m.plays || 0) * 0.5 +
    freshness
  );
}

/* ---------------- HANDLER ---------------- */
export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.end();

    const { action } = req.query;
    if (!action || action === "ping")
      return res.json({ ok:true, time:Date.now() });

    const b = await body(req);

    // Load all (small scale MVP)
    const users = await load("users.json");
    const posts = await load("posts.json");
    const audio = await load("audio.json");
    const metrics = await load("metrics.json");
    const relations = await load("relations.json");
    const indexes = await load("indexes.json");
    const ranking = await load("ranking.json");

    /* ---------- USER CREATE ---------- */
    if (action === "user:create") {
      const id = "u_" + Date.now();
      users.data[id] = {
        id,
        name: b.name || "User",
        createdAt: Date.now(),
        preferences: { languages:{}, likedAudio:{} }
      };
      await save("users.json", users.data, users.sha, "user:create");
      return res.json({ ok:true, id });
    }

    /* ---------- AUDIO REGISTER ---------- */
    if (action === "audio:create") {
      audio.data[b.id] = b;
      await save("audio.json", audio.data, audio.sha, "audio:create");
      return res.json({ ok:true });
    }

    /* ---------- POST CREATE ---------- */
    if (action === "post:create") {
      const id = "c_" + Date.now();
      posts.data[id] = {
        id,
        ownerId: b.userId,
        audioId: b.audioId,
        clip: b.clip,
        createdAt: Date.now()
      };

      metrics.data.content[id] = { likes:0, plays:0, shares:0, comments:0 };
      ranking.data[id] = { score:0 };

      indexes.data.feeds.latest.unshift(id);
      indexes.data.byUser[b.userId] ??= [];
      indexes.data.byUser[b.userId].unshift(id);

      const lang = audio.data[b.audioId]?.language;
      if (lang) {
        indexes.data.byLanguage[lang] ??= [];
        indexes.data.byLanguage[lang].unshift(id);
      }

      await save("posts.json", posts.data, posts.sha, "post:create");
      await save("metrics.json", metrics.data, metrics.sha, "metrics:init");
      await save("indexes.json", indexes.data, indexes.sha, "index:update");
      await save("ranking.json", ranking.data, ranking.sha, "ranking:init");
      return res.json({ ok:true, id });
    }

    /* ---------- LIKE ---------- */
    if (action === "post:like") {
      relations.data.likes[b.userId] ??= {};
      if (relations.data.likes[b.userId][b.postId])
        return res.json({ ok:false });

      relations.data.likes[b.userId][b.postId] = true;
      metrics.data.content[b.postId].likes++;

      const m = metrics.data.content[b.postId];
      const p = posts.data[b.postId];
      ranking.data[b.postId].score = computeScore(m, p.createdAt);

      indexes.data.feeds.trending = Object.entries(ranking.data)
        .sort((a,b)=>b[1].score-a[1].score)
        .map(x=>x[0])
        .slice(0,20);

      await save("relations.json", relations.data, relations.sha, "like");
      await save("metrics.json", metrics.data, metrics.sha, "metrics:like");
      await save("ranking.json", ranking.data, ranking.sha, "ranking:update");
      await save("indexes.json", indexes.data, indexes.sha, "trending:update");

      return res.json({ ok:true });
    }

    /* ---------- FEEDS ---------- */
    if (action === "feed:latest")
      return res.json({
        ok:true,
        data: indexes.data.feeds.latest.map(id => ({
          ...posts.data[id],
          metrics: metrics.data.content[id],
          audio: audio.data[posts.data[id].audioId]
        }))
      });

    if (action === "feed:trending")
      return res.json({
        ok:true,
        data: indexes.data.feeds.trending.map(id => ({
          ...posts.data[id],
          metrics: metrics.data.content[id],
          audio: audio.data[posts.data[id].audioId]
        }))
      });

    /* ---------- SUGGESTIONS ---------- */
    if (action === "suggest") {
      const p = posts.data[b.postId];
      const sameAudio = indexes.data.byAudio[p.audioId] || [];
      const lang = audio.data[p.audioId]?.language;
      const sameLang = indexes.data.byLanguage[lang] || [];
      const trending = indexes.data.feeds.trending || [];

      const set = [...new Set([...sameAudio, ...sameLang, ...trending])]
        .filter(x => x !== b.postId)
        .slice(0,10);

      return res.json({ ok:true, data:set });
    }

    return res.json({ ok:false, error:"Unknown action" });

  } catch (e) {
    return res.json({ ok:false, error:e.message });
  }
}
