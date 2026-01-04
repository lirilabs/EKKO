// =====================================================
// EKKO COMBINED SERVERLESS BACKEND
// (body + crypto + env + github + guards + storage + trending)
// =====================================================

const GH_API = "https://api.github.com";

/* =====================================================
   ENV
===================================================== */
function getEnv() {
  return {
    github: {
      user: process.env.GITHUB_USERNAME || null,
      repo: process.env.GITHUB_REPO || null,
      branch: process.env.GITHUB_BRANCH || "main",
      token: process.env.GITHUB_TOKEN || null
    },
    cryptoKey: process.env.DATA_ENCRYPTION_KEY || null,
    rateLimit: Number(process.env.RATE_LIMIT || 100)
  };
}

function isReady(env) {
  return Boolean(
    env.github.user &&
    env.github.repo &&
    env.github.token &&
    env.cryptoKey &&
    env.cryptoKey.length === 64
  );
}

/* =====================================================
   SAFE BODY PARSER (VERCEL SAFE)
===================================================== */
async function parseBody(req) {
  if (req.method === "GET" || req.method === "DELETE") return {};

  const len = Number(req.headers["content-length"] || 0);
  if (len === 0) return {};

  return new Promise(resolve => {
    let data = "";
    req.on("data", chunk => (data += chunk));
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

/* =====================================================
   CRYPTO (AES-256-GCM, LAZY & SAFE)
===================================================== */
async function getCrypto(keyHex) {
  if (!keyHex || keyHex.length !== 64) return null;

  const crypto = await import("crypto");
  const key = Buffer.from(keyHex, "hex");

  return {
    encrypt(obj) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      let enc = cipher.update(JSON.stringify(obj), "utf8", "base64");
      enc += cipher.final("base64");
      return {
        iv: iv.toString("hex"),
        data: enc,
        tag: cipher.getAuthTag().toString("hex")
      };
    },
    decrypt(payload) {
      try {
        if (!payload?.iv || !payload?.data || !payload?.tag) return null;
        const decipher = crypto.createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(payload.iv, "hex")
        );
        decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
        let dec = decipher.update(payload.data, "base64", "utf8");
        dec += decipher.final("utf8");
        return JSON.parse(dec);
      } catch {
        return null;
      }
    }
  };
}

/* =====================================================
   RATE LIMIT (BASIC, IN-MEMORY)
===================================================== */
const hits = new Map();
function rateLimit(ip, limit) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, time: now };
  if (now - rec.time > 60_000) {
    hits.set(ip, { count: 1, time: now });
    return true;
  }
  rec.count++;
  hits.set(ip, rec);
  return rec.count <= limit;
}

/* =====================================================
   GITHUB API
===================================================== */
async function ghRequest(env, url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.github.token}`,
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

/* =====================================================
   STORAGE (AUTO-HEAL + ENCRYPTED)
===================================================== */
const EMPTY_DB = { users: {}, contents: {}, likes: {} };

async function loadDB(env, crypto) {
  const url =
    `${GH_API}/repos/${env.github.user}` +
    `/${env.github.repo}` +
    `/contents/data/db.enc.json?ref=${env.github.branch}`;

  const file = await ghRequest(env, url);
  const raw = JSON.parse(
    Buffer.from(file.content, "base64").toString("utf8")
  );

  const db = crypto.decrypt(raw);
  if (!db) {
    return { db: EMPTY_DB, sha: file.sha, fresh: true };
  }

  return { db, sha: file.sha, fresh: false };
}

async function saveDB(env, crypto, db, sha, msg) {
  const encrypted = crypto.encrypt(db);
  const url =
    `${GH_API}/repos/${env.github.user}` +
    `/${env.github.repo}` +
    `/contents/data/db.enc.json`;

  await ghRequest(env, url, "PUT", {
    message: msg,
    content: Buffer.from(JSON.stringify(encrypted)).toString("base64"),
    sha,
    branch: env.github.branch
  });
}

/* =====================================================
   TRENDING
===================================================== */
function trending(contents) {
  const now = Date.now();
  return Object.values(contents)
    .map(c => {
      const ageH = (now - c.createdAt) / 3_600_000;
      return { ...c, score: c.likes * 3 + Math.max(0, 24 - ageH) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

/* =====================================================
   MAIN HANDLER
===================================================== */
export default async function handler(req, res) {
  try {
    // -------- CORS (ALLOW ALL) --------
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    if (req.method === "OPTIONS") return res.status(204).end();

    const { action } = req.query;

    // -------- PING (ALWAYS WORKS) --------
    if (!action || action === "ping") {
      return res.json({
        ok: true,
        status: "EKKO LIVE",
        time: Date.now()
      });
    }

    const env = getEnv();
    if (!isReady(env)) {
      return res.status(503).json({
        ok: false,
        error: "Server not ready"
      });
    }

    if (!rateLimit(req.socket.remoteAddress, env.rateLimit)) {
      return res.status(429).json({ ok: false, error: "Rate limit" });
    }

    const crypto = await getCrypto(env.cryptoKey);
    const body = await parseBody(req);
    const { db, sha, fresh } = await loadDB(env, crypto);

    if (fresh) {
      await saveDB(env, crypto, db, sha, "init db");
    }

    // -------- USER CREATE --------
    if (action === "user:create" && req.method === "POST") {
      const id = "u_" + Date.now();
      db.users[id] = { id, name: body.name || "Anon", createdAt: Date.now() };
      await saveDB(env, crypto, db, sha, `user:create ${id}`);
      return res.json({ ok: true, id });
    }

    // -------- CONTENT CREATE --------
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
      await saveDB(env, crypto, db, sha, `content:create ${id}`);
      return res.json({ ok: true, id });
    }

    // -------- LIKE --------
    if (action === "content:like" && req.method === "POST") {
      const key = `${body.userId}_${body.contentId}`;
      if (db.likes[key]) return res.json({ ok: false });
      db.likes[key] = true;
      if (db.contents[body.contentId]) {
        db.contents[body.contentId].likes++;
      }
      await saveDB(env, crypto, db, sha, "like");
      return res.json({ ok: true });
    }

    // -------- TRENDING --------
    if (action === "content:trending") {
      return res.json({ ok: true, data: trending(db.contents) });
    }

    return res.json({ ok: false, message: "Unknown action" });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
