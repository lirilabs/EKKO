// ===============================
// SAFE BODY PARSER
// ===============================
async function getBody(req) {
  return new Promise(resolve => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

// ===============================
// LAZY CRYPTO (NEVER AT IMPORT)
// ===============================
async function getCrypto() {
  const keyHex = process.env.DATA_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) return null;

  const crypto = await import("crypto");
  return {
    crypto,
    key: Buffer.from(keyHex, "hex")
  };
}

function encryptJSON(cryptoObj, data) {
  const iv = cryptoObj.crypto.randomBytes(12);
  const cipher = cryptoObj.crypto.createCipheriv(
    "aes-256-gcm",
    cryptoObj.key,
    iv
  );

  let enc = cipher.update(JSON.stringify(data), "utf8", "base64");
  enc += cipher.final("base64");

  return {
    iv: iv.toString("hex"),
    data: enc,
    tag: cipher.getAuthTag().toString("hex")
  };
}

function decryptJSON(cryptoObj, payload) {
  try {
    if (!payload?.iv || !payload?.data || !payload?.tag) return null;

    const decipher = cryptoObj.crypto.createDecipheriv(
      "aes-256-gcm",
      cryptoObj.key,
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

// ===============================
// LAZY GITHUB STORAGE
// ===============================
async function getGitHub() {
  if (!process.env.GITHUB_TOKEN) return null;

  return {
    api: "https://api.github.com",
    user: process.env.GITHUB_USERNAME,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || "main",
    token: process.env.GITHUB_TOKEN,
    path: "data/db.enc.json"
  };
}

async function ghRequest(gh, url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${gh.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadDB(gh, cryptoObj) {
  const url = `${gh.api}/repos/${gh.user}/${gh.repo}/contents/${gh.path}?ref=${gh.branch}`;
  const file = await ghRequest(gh, url);

  const raw = JSON.parse(
    Buffer.from(file.content, "base64").toString("utf8")
  );

  const decrypted = decryptJSON(cryptoObj, raw);

  if (!decrypted) {
    return {
      db: { users: {}, contents: {}, likes: {} },
      sha: file.sha,
      fresh: true
    };
  }

  return { db: decrypted, sha: file.sha, fresh: false };
}

async function saveDB(gh, cryptoObj, db, sha, msg) {
  const encrypted = encryptJSON(cryptoObj, db);

  const url = `${gh.api}/repos/${gh.user}/${gh.repo}/contents/${gh.path}`;
  return ghRequest(gh, url, "PUT", {
    message: msg,
    content: Buffer.from(JSON.stringify(encrypted)).toString("base64"),
    sha,
    branch: gh.branch
  });
}

// ===============================
// MAIN HANDLER
// ===============================
export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.end();

    const { action } = req.query;
    const body = await getBody(req);

    // Health check (NEVER FAILS)
    if (!action || action === "ping") {
      return res.json({ ok: true, status: "EKKO LIVE", time: Date.now() });
    }

    const cryptoObj = await getCrypto();
    const gh = await getGitHub();
    if (!cryptoObj || !gh) {
      return res.status(500).json({ ok: false, error: "Server not ready" });
    }

    const { db, sha, fresh } = await loadDB(gh, cryptoObj);

    if (fresh) {
      await saveDB(gh, cryptoObj, db, sha, "init db");
    }

    // USER CREATE
    if (action === "user:create" && req.method === "POST") {
      const id = "u_" + Date.now();
      db.users[id] = { id, name: body.name || "Anonymous", createdAt: Date.now() };
      await saveDB(gh, cryptoObj, db, sha, `user:create ${id}`);
      return res.json({ ok: true, id });
    }

    // CONTENT CREATE
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
      await saveDB(gh, cryptoObj, db, sha, `content:create ${id}`);
      return res.json({ ok: true, id });
    }

    // LIKE (SLEEP SAFE)
    if (action === "content:like" && req.method === "POST") {
      const key = `${body.userId}_${body.contentId}`;
      if (db.likes[key]) {
        return res.json({ ok: false, message: "Already liked" });
      }
      db.likes[key] = true;
      if (db.contents[body.contentId]) {
        db.contents[body.contentId].likes++;
      }
      await saveDB(gh, cryptoObj, db, sha, `content:like ${body.contentId}`);
      return res.json({ ok: true });
    }

    // TRENDING
    if (action === "content:trending") {
      const list = Object.values(db.contents)
        .sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
      return res.json({ ok: true, data: list });
    }

    return res.json({ ok: false, message: "Unknown action" });

  } catch (err) {
    console.error("FATAL:", err.message);
    return res.status(500).json({ ok: false });
  }
}
