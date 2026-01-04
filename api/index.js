import { readStore, writeStore } from "./storage.js";
import { getTrending } from "./trending.js";
import crypto from "crypto";
import "dotenv/config";

const uid = () => crypto.randomUUID();

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");

  if (req.method === "OPTIONS") return res.end();

  const db = readStore();
  const { action } = req.query;

  // CREATE USER
  if (action==="user:create") {
    const id = uid();
    db.users[id] = {
      id,
      name: req.body.name,
      avatar: req.body.avatar,
      createdAt: Date.now()
    };
    writeStore(db);
    return res.json({ ok:true, id });
  }

  // CREATE CONTENT (AUDIO MOMENT)
  if (action==="content:create") {
    const id = uid();
    db.contents[id] = {
      id,
      uploaderId: req.body.uploaderId,
      sourceUrl: req.body.sourceUrl,
      start: req.body.start,
      end: req.body.end,
      audioUrl: req.body.audioUrl, // temp only
      image: req.body.image,
      song: req.body.song,
      artist: req.body.artist,
      title: req.body.title,
      likes: 0,
      createdAt: Date.now()
    };
    writeStore(db);
    return res.json({ ok:true, id });
  }

  // LIKE
  if (action==="content:like") {
    const key = `${req.body.userId}_${req.body.contentId}`;
    if (db.likes[key]) return res.json({ ok:false });

    db.likes[key] = true;
    db.contents[req.body.contentId].likes++;
    writeStore(db);
    return res.json({ ok:true });
  }

  // TRENDING
  if (action==="content:trending") {
    return res.json({
      ok:true,
      data: getTrending(db.contents)
    });
  }

  res.status(400).json({ ok:false });
}
