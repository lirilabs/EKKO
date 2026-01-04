import { encryptJSON, decryptJSON } from "./crypto.js";

const {
  GITHUB_USERNAME,
  GITHUB_REPO,
  GITHUB_BRANCH,
  GITHUB_TOKEN
} = process.env;

const DB_PATH = "data/db.enc.json";
const GH_API = "https://api.github.com";

// -------- In-memory cache (warm start) --------
let CACHE = null;
let CACHE_SHA = null;
let CACHE_TIME = 0;
const CACHE_TTL = 10_000; // 10 seconds

async function gh(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
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

export async function loadDB(force = false) {
  const now = Date.now();

  if (!force && CACHE && now - CACHE_TIME < CACHE_TTL) {
    return { db: CACHE, sha: CACHE_SHA };
  }

  const url = `${GH_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${DB_PATH}?ref=${GITHUB_BRANCH}`;
  const file = await gh(url);

  const decrypted = decryptJSON(
    JSON.parse(Buffer.from(file.content, "base64").toString("utf8"))
  );

  CACHE = decrypted;
  CACHE_SHA = file.sha;
  CACHE_TIME = now;

  return { db: CACHE, sha: CACHE_SHA };
}

export async function saveDB(db, sha, message, retry = 0) {
  try {
    const encrypted = encryptJSON(db);

    const url = `${GH_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${DB_PATH}`;
    const res = await gh(url, "PUT", {
      message,
      content: Buffer.from(JSON.stringify(encrypted)).toString("base64"),
      sha,
      branch: GITHUB_BRANCH
    });

    CACHE = db;
    CACHE_SHA = res.content.sha;
    CACHE_TIME = Date.now();

    return true;
  } catch (err) {
    // Retry once on SHA conflict (race condition)
    if (retry < 1) {
      const fresh = await loadDB(true);
      return saveDB(fresh.db, fresh.sha, message, retry + 1);
    }
    throw err;
  }
}
