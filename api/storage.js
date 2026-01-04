import { encryptJSON, decryptJSON } from "./crypto.js";

const EMPTY_DB = {
  users: {},
  contents: {},
  likes: {}
};

export async function loadDB(force = false) {
  const file = await fetchGitHubFile(); // your existing GH fetch
  const raw = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));

  const decrypted = decryptJSON(raw);

  // 🔴 AUTO-HEAL IF INVALID
  if (!decrypted) {
    console.warn("⚠️ DB corrupted or empty, reinitializing");

    const fresh = encryptJSON(EMPTY_DB);
    await saveRawToGitHub(fresh, file.sha, "reset corrupted db");

    return { db: EMPTY_DB, sha: file.sha };
  }

  return { db: decrypted, sha: file.sha };
}
