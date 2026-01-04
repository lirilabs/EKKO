import { loadDB, saveDB } from "./storage.js";
import { computeTrending } from "./trending.js";

// ---------- Safe body parser ----------
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

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.end();

    const { action } = req.query;
    const body = await getBody(req);

    if (action === "ping") {
      return res.json({ ok: true, pong: Date.now() });
    }

    const { db, sha } = await loadDB();

    // ---------- Create user ----------
    if (action === "user:create" && req.method === "POST") {
      const id = "u_" + Date.now();
      db.users[id] = {
        id,
        name: body.name || "Anonymous",
        avatar: body.avatar || "",
        createdAt: Date.now()
      };
      await saveDB(db, sha, `user:create ${id}`);
      return res.json({ ok: true, id });
    }

    // ---------- Create content ----------
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
        image: body.image,
        audioUrl: body.audioUrl,
        likes: 0,
        createdAt: Date.now()
      };
      await saveDB(db, sha, `content:create ${id}`);
      return res.json({ ok: true, id });
    }

    // ---------- Like (sleep-safe) ----------
    if (action === "content:like" && req.method === "POST") {
      const key = `${body.userId}_${body.contentId}`;
      if (db.likes[key]) {
        return res.json({ ok: false, message: "Already liked" });
      }
      db.likes[key] = true;
      if (db.contents[body.contentId]) {
        db.contents[body.contentId].likes += 1;
      }
      await saveDB(db, sha, `content:like ${body.contentId}`);
      return res.json({ ok: true });
    }

    // ---------- Trending ----------
    if (action === "content:trending") {
      return res.json({
        ok: true,
        data: computeTrending(db.contents)
      });
    }

    return res.json({ ok: false, message: "Unknown action" });

  } catch (err) {
    console.error("API ERROR:", err.message);
    return res.status(500).json({ ok: false });
  }
}
