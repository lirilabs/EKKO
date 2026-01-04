import { getEnv, isReady } from "./env.js";
import { parseBody } from "./body.js";
import { getCrypto } from "./crypto.js";
import { getGitHub } from "./github.js";
import { loadDB, saveDB } from "./storage.js";
import { trending } from "./trending.js";
import { rateLimit } from "./guards.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.end();

    const env = getEnv();
    if (!isReady(env)) {
      return res.json({ ok: false, error: "Server not ready" });
    }

    if (!rateLimit(req.socket.remoteAddress, env.rateLimit)) {
      return res.status(429).json({ ok: false, error: "Rate limit" });
    }

    const crypto = await getCrypto(env.cryptoKey);
    const gh = getGitHub(env);
    const body = await parseBody(req);
    const { action } = req.query;

    if (!action || action === "ping") {
      return res.json({ ok: true, status: "EKKO LIVE" });
    }

    const { db, sha, fresh } = await loadDB(gh, crypto);
    if (fresh) await saveDB(gh, crypto, db, sha, "init db");

    if (action === "user:create") {
      const id = "u_" + Date.now();
      db.users[id] = { id, name: body.name || "Anon", createdAt: Date.now() };
      await saveDB(gh, crypto, db, sha, `user ${id}`);
      return res.json({ ok: true, id });
    }

    if (action === "content:like") {
      const key = `${body.userId}_${body.contentId}`;
      if (db.likes[key]) return res.json({ ok: false });
      db.likes[key] = true;
      db.contents[body.contentId].likes++;
      await saveDB(gh, crypto, db, sha, "like");
      return res.json({ ok: true });
    }

    if (action === "content:trending") {
      return res.json({ ok: true, data: trending(db.contents) });
    }

    return res.json({ ok: false, message: "Unknown action" });

  } catch (e) {
    console.error("ERROR:", e.message);
    return res.status(500).json({ ok: false });
  }
}
