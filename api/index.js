import "dotenv/config"; // REQUIRED
import crypto from "crypto";
import { readStore, writeStore } from "./storage.js";
import { getTrending } from "./trending.js";

const uid = () => crypto.randomUUID();

export default function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    const { action } = req.query;
    const db = readStore();

    // ---------------- USER CREATE ----------------
    if (action === "user:create" && req.method === "POST") {
      const id = uid();
      db.users[id] = {
        id,
        name: req.body?.name || "Anonymous",
        avatar: req.body?.avatar || "",
        createdAt: Date.now()
      };
      writeStore(db);
      return res.json({ ok: true, id });
    }

    // ---------------- CONTENT CREATE ----------------
    if (action === "content:create" && req.method === "POST") {
      const id = uid();
      db.contents[id] = {
        id,
        uploaderId: req.body.uploaderId,
        sourceUrl: req.body.sourceUrl,
        start: req.body.start,
        end: req.body.end,
        audioUrl: req.body.audioUrl, // TEMP ONLY
        image: req.body.image,
        song: req.body.song,
        artist: req.body.artist,
        title: req.body.title,
        likes: 0,
        createdAt: Date.now()
      };
      writeStore(db);
      return res.json({ ok: true, id });
    }

    // ---------------- LIKE ----------------
    if (action === "content:like" && req.method === "POST") {
      const key = `${req.body.userId}_${req.body.contentId}`;
      if (db.likes[key]) {
        return res.json({ ok: false, message: "Already liked" });
      }
      db.likes[key] = true;
      if (db.contents[req.body.contentId]) {
        db.contents[req.body.contentId].likes++;
      }
      writeStore(db);
      return res.json({ ok: true });
    }

    // ---------------- TRENDING ----------------
    if (action === "content:trending") {
      return res.json({
        ok: true,
        data: getTrending(db.contents)
      });
    }

    return res.status(400).json({ ok: false, message: "Invalid action" });
  } catch (err) {
    console.error("API CRASH:", err);
    return res.status(500).json({ ok: false, error: "Server crashed" });
  }
}
