import { ghRequest } from "./github.js";

const EMPTY_DB = { users: {}, contents: {}, likes: {} };

export async function loadDB(gh, crypto) {
  const url = `${gh.api}/repos/${gh.user}/${gh.repo}/contents/${gh.path}?ref=${gh.branch}`;
  const file = await ghRequest(gh, url);

  const raw = JSON.parse(
    Buffer.from(file.content, "base64").toString("utf8")
  );

  const db = crypto.decrypt(raw);
  if (!db) return { db: EMPTY_DB, sha: file.sha, fresh: true };

  return { db, sha: file.sha, fresh: false };
}

export async function saveDB(gh, crypto, db, sha, msg) {
  const encrypted = crypto.encrypt(db);

  const url = `${gh.api}/repos/${gh.user}/${gh.repo}/contents/${gh.path}`;
  await ghRequest(gh, url, "PUT", {
    message: msg,
    content: Buffer.from(JSON.stringify(encrypted)).toString("base64"),
    sha,
    branch: gh.branch
  });
}
