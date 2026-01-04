// ===============================
// SAFE BODY PARSER
// ===============================
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

// ===============================
// GITHUB CONFIG
// ===============================
const {
  GITHUB_USERNAME,
  GITHUB_REPO,
  GITHUB_BRANCH,
  GITHUB_TOKEN,
  GITHUB_DB_PATH
} = process.env;

const GH_API = "https://api.github.com";

// ===============================
// GITHUB HELPERS
// ===============================
async function ghRequest(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}

async function readDB() {
  const url = `${GH_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}?ref=${GITHUB_BRANCH}`;
  const file = await ghRequest(url);

  const content = Buffer.from(file.content, "base64").toString("utf8");
  return {
    data: JSON.parse(content),
    sha: file.sha
  };
}

async function writeDB(data, sha, message) {
  const url = `${GH_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}`;

  return ghRequest(url, "PUT", {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
    sha,
    branch: GITHUB_BRANCH
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

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const { action } = req.query;
    const body = await getBody(req);

    // HEALTH CHECK
    if (action === "ping") {
      return res.json({ ok: true, pong: Date.now() });
    }

    // LOAD DB
    const { data: DB, sha } = await readDB();

    // CREATE USER
    if (action === "user:create" && req.method === "POST") {
      const id = "u_" + Date.now();

      DB.users[id] = {
        id,
        name: body.name || "Anonymous",
        avatar: body.avatar || "",
        createdAt: Date.now()
      };

      await writeDB(DB, sha, `Create user ${id}`);
      return res.json({ ok: true, id });
    }

    // CREATE CONTENT
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

      await writeDB(DB, sha, `Create content ${id}`);
      return res.json({ ok: true, id });
    }

    // LIKE CONTENT
    if (action === "content:like" && req.method === "POST") {
      const key = `${body.userId}_${body.contentId}`;
      if (DB.likes[key]) {
        return res.json({ ok: false, message: "Already liked" });
      }

      DB.likes[key] = true;
      if (DB.contents[body.contentId]) {
        DB.contents[body.contentId].likes++;
      }

      await writeDB(DB, sha, `Like content ${body.contentId}`);
      return res.json({ ok: true });
    }

    // TRENDING
    if (action === "content:trending") {
      const trending = Object.values(DB.contents)
        .sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);

      return res.json({ ok: true, data: trending });
    }

    return res.json({ ok: false, message: "Unknown action" });

  } catch (err) {
    console.error("API ERROR:", err.message);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
