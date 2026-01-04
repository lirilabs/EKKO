const GH = "https://api.github.com";

/* ---------------- GitHub Helper ---------------- */
async function gh(path, method = "GET", body) {
  const url = `${GH}/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}/contents/data/${path}?ref=${process.env.GITHUB_BRANCH || "main"}`;

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
    content: Buffer.from(JSON.stringify(data)).toString("base64"),
    sha,
    branch: process.env.GITHUB_BRANCH || "main"
  });
}

/* ---------------- DELETE HANDLER ---------------- */
export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.end();

    if (req.method !== "DELETE") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    let body = "";
    req.on("data", c => (body += c));
    req.on("end", async () => {
      const { post_id } = JSON.parse(body || "{}");
      if (!post_id) {
        return res.json({ ok: false, error: "post_id required" });
      }

      // Load all files
      const posts = await load("posts.json");
      const metrics = await load("metrics.json");
      const ranking = await load("ranking.json");
      const relations = await load("relations.json");
      const indexes = await load("indexes.json");

      const post = posts.data[post_id];
      if (!post) {
        return res.json({ ok: false, error: "Post not found" });
      }

      const ownerId = post.ownerId;
      const audioId = post.audioId;

      // 1. Remove post
      delete posts.data[post_id];

      // 2. Remove metrics & ranking
      delete metrics.data.content[post_id];
      delete ranking.data[post_id];

      // 3. Remove likes
      for (const uid in relations.data.likes) {
        delete relations.data.likes[uid]?.[post_id];
      }

      // 4. Remove from indexes
      indexes.data.feeds.latest =
        indexes.data.feeds.latest.filter(id => id !== post_id);

      indexes.data.feeds.trending =
        indexes.data.feeds.trending.filter(id => id !== post_id);

      indexes.data.byUser[ownerId] =
        (indexes.data.byUser[ownerId] || []).filter(id => id !== post_id);

      if (indexes.data.byAudio[audioId]) {
        indexes.data.byAudio[audioId] =
          indexes.data.byAudio[audioId].filter(id => id !== post_id);
      }

      // Save all
      await save("posts.json", posts.data, posts.sha, "delete post");
      await save("metrics.json", metrics.data, metrics.sha, "delete post");
      await save("ranking.json", ranking.data, ranking.sha, "delete post");
      await save("relations.json", relations.data, relations.sha, "delete post");
      await save("indexes.json", indexes.data, indexes.sha, "delete post");

      return res.json({ ok: true, deleted: post_id });
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
