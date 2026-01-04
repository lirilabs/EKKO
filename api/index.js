// ---------- SAFE BODY PARSER ----------
async function getBody(req) {
  return new Promise((resolve) => {
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

// ---------- IN-MEMORY DATABASE ----------
let DB = {
  users: {},
  contents: {},
  likes: {}
};

// ---------- HANDLER ----------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const { action } = req.query;
  const body = await getBody(req);

  // ---------------- CREATE USER ----------------
  if (action === "user:create" && req.method === "POST") {
    const id = "u_" + Date.now();
    DB.users[id] = {
      id,
      name: body.name || "Anonymous",
      avatar: body.avatar || "",
      createdAt: Date.now()
    };

    return res.json({ ok: true, id });
  }

  // ---------------- CREATE CONTENT ----------------
  if (action === "content:create" && req.method === "POST") {
    const id = "c_" + Date.now();
    DB.contents[id] = {
      id,
      uploaderId: body.uploaderId,
      sourceUrl: body.sourceUrl,
      start: body.start,
      end: body.end,
      audioUrl: body.audioUrl,
      image: body.image,
      song: body.song,
      artist: body.artist,
      title: body.title,
      likes: 0,
      createdAt: Date.now()
    };

    return res.json({ ok: true, id });
  }

  // ---------------- LIKE CONTENT ----------------
  if (action === "content:like" && req.method === "POST") {
    const key = `${body.userId}_${body.contentId}`;

    if (DB.likes[key]) {
      return res.json({ ok: false, message: "Already liked" });
    }

    DB.likes[key] = true;
    if (DB.contents[body.contentId]) {
      DB.contents[body.contentId].likes++;
    }

    return res.json({ ok: true });
  }

  // ---------------- TRENDING ----------------
  if (action === "content:trending") {
    return res.json({
      ok: true,
      data: Object.values(DB.contents)
    });
  }

  // ---------------- FALLBACK ----------------
  return res.json({ ok: false, message: "Unknown action" });
}
