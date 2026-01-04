// ===============================
// SAFE JSON BODY PARSER
// ===============================
async function getBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
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
// IN-MEMORY DATABASE (SAFE)
// ===============================
let DB = {
  users: {},
  contents: {},
  likes: {}
};

// ===============================
// MAIN HANDLER
// ===============================
export default async function handler(req, res) {
  try {
    // ---------- CORS ----------
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    res.setHeader("Content-Type", "application/json");

    const { action } = req.query;
    const body = await getBody(req);

    // ===============================
    // HEALTH CHECK
    // ===============================
    if (action === "ping") {
      return res.status(200).json({
        ok: true,
        pong: Date.now()
      });
    }

    // ===============================
    // CREATE USER (POST)
    // ===============================
    if (action === "user:create" && req.method === "POST") {
      const id = "u_" + Date.now();

      DB.users[id] = {
        id,
        name: body.name || "Anonymous",
        avatar: body.avatar || "",
        createdAt: Date.now()
      };

      return res.status(200).json({
        ok: true,
        id
      });
    }

    // ===============================
    // CREATE CONTENT (POST)
    // ===============================
    if (action === "content:create" && req.method === "POST") {
      const id = "c_" + Date.now();

      DB.contents[id] = {
        id,
        uploaderId: body.uploaderId || null,
        sourceUrl: body.sourceUrl || "",
        start: body.start || 0,
        end: body.end || 0,
        audioUrl: body.audioUrl || "",
        image: body.image || "",
        song: body.song || "",
        artist: body.artist || "",
        title: body.title || "",
        likes: 0,
        createdAt: Date.now()
      };

      return res.status(200).json({
        ok: true,
        id
      });
    }

    // ===============================
    // LIKE CONTENT (POST)
    // ===============================
    if (action === "content:like" && req.method === "POST") {
      const userId = body.userId;
      const contentId = body.contentId;

      if (!userId || !contentId) {
        return res.status(400).json({
          ok: false,
          message: "Missing userId or contentId"
        });
      }

      const key = `${userId}_${contentId}`;

      if (DB.likes[key]) {
        return res.status(200).json({
          ok: false,
          message: "Already liked"
        });
      }

      DB.likes[key] = true;

      if (DB.contents[contentId]) {
        DB.contents[contentId].likes += 1;
      }

      return res.status(200).json({
        ok: true
      });
    }

    // ===============================
    // TRENDING CONTENT (GET)
    // ===============================
    if (action === "content:trending") {
      const trending = Object.values(DB.contents).sort(
        (a, b) => b.likes - a.likes || b.createdAt - a.createdAt
      );

      return res.status(200).json({
        ok: true,
        data: trending
      });
    }

    // ===============================
    // FALLBACK
    // ===============================
    return res.status(200).json({
      ok: false,
      message: "Unknown action"
    });

  } catch (err) {
    console.error("API ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}

