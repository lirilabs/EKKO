// =====================================================
// EKKO SIMPLE BACKEND (NO ENCRYPTION, CORS ALLOWED)
// =====================================================

const GH_API = "https://api.github.com";

// ---------------- SAFE BODY PARSER ----------------
async function parseBody(req) {
  // GET / DELETE never have body
  if (req.method === "GET" || req.method === "DELETE") {
    return {};
  }

  const length = Number(req.headers["content-length"] || 0);
  if (length === 0) return {};

  return new Promise(resolve => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;
    });

    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

// ---------------- GitHub Request ----------------
async function ghRequest(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

// ---------------- Load DB ----------------
async function loadDB() {
  const url =
    `${GH_API}/repos/${process.env.GITHUB_USERNAME}` +
    `/${process.env.GITHUB_REPO}` +
    `/contents/data/db.json?ref=${process.env.GITHUB_BRANCH || "main"}`;

  const file = await ghRequest(url);
  const db = JSON.parse(
    Buffer.from(file.content, "base64").toString("utf8")
  );

  return { db, sha: file.sha };
}

// ---------------- Save DB ----------------
async function saveDB(db, sha, message) {
  const url =
    `${GH_API}/repos/${process.env.GITHUB_USERNAME}` +
    `/${process.env.GITHUB_REPO}` +
    `/contents/data/db.json`;

  await ghRequest(url, "PUT", {
    message,
    content: Buffer.from(JSON.stringify(db, null, 2)).toString("base64"),
    sha,
    branch: process.env.GITHUB_BRANCH || "main"
  });
}

// =====================================================
// MAIN HANDLER
// =====================================================
export default async function handler(req, res) {
  try {
    // ---------- CORS (ALLOW ALL ORIGINS) ----------
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).end();

    const { action } = req.query;

    // ---------- PING (ALWAYS WORKS) ----------
    if (!action || action === "ping") {
      return res.json({
        ok: true,
        status: "EKKO LIVE",
        time: Date.now()
      });
    }

    // ---------- ENV CHECK ----------
    if (
      !process.env.GITHUB_USERNAME ||
      !process.env.GITHUB_REPO ||
      !process.env.GITHUB_TOKEN
    ) {
      return res.status(500).json({
        ok: false,
        error: "Server not ready"
      });
    }

    const body = await parseBody(req);
    const { db, sha } = await loadDB();

    // ---------- CREATE USER ----------
    if (action === "user:create" && req.method === "POST") {
      const id = "u_" + Date.now();
      db.users[id] = {
        id,
        name: body.name || "Anonymous",
        createdAt: Date.now()
      };
      await saveDB(db, sha, `user:create ${id}`);
      return res.json({ ok: true, id });
    }

    // ---------- CREATE CONTENT ----------
    if (action === "content:create" && req.method === "POST") {
      const id = "c_" + Date.now();
      db.contents[id] = {
        id,
        uploaderId: body.uploaderId,
        song: body.song,
        artist: body.artist,
        title: body.title,
        start: body.start,
        end: body.end,
        likes: 0,
        createdAt: Date.now()
      };
      await saveDB(db, sha, `content:create ${id}`);
      return res.json({ ok: true, id });
    }

    // ---------- LIKE CONTENT ----------
    if (action === "content:like" && req.method === "POST") {
      const key = `${body.userId}_${body.contentId}`;

      if (db.likes[key]) {
        return res.json({ ok: false, message: "Already liked" });
      }

      db.likes[key] = true;
      if (db.contents[body.contentId]) {
        db.contents[body.contentId].likes++;
      }

      await saveDB(db, sha, `content:like ${body.contentId}`);
      return res.json({ ok: true });
    }

    // ---------- TRENDING ----------
    if (action === "content:trending") {
      const list = Object.values(db.contents).sort(
        (a, b) => b.likes - a.likes || b.createdAt - a.createdAt
      );
      return res.json({ ok: true, data: list });
    }

    return res.json({ ok: false, message: "Unknown action" });

  } catch (err) {
    // SHOW ERROR FOR DEBUG
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
