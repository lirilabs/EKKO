import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "./crypto.js";

// Vercel allows write ONLY to /tmp
const FILE_PATH = path.join("/tmp", "ekko-data.enc");

const EMPTY_DB = {
  users: {},
  contents: {},
  likes: {}
};

export function readStore() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      writeStore(EMPTY_DB);
      return EMPTY_DB;
    }

    const raw = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    return decrypt(raw);
  } catch (err) {
    console.error("STORE READ ERROR:", err);
    return EMPTY_DB; // fail-safe
  }
}

export function writeStore(data) {
  try {
    const encrypted = encrypt(data);
    fs.writeFileSync(FILE_PATH, JSON.stringify(encrypted));
  } catch (err) {
    console.error("STORE WRITE ERROR:", err);
    throw err;
  }
}
