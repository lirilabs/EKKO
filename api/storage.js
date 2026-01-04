import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "./crypto.js";

const FILE = path.join(process.cwd(), "api", "data.enc");

export function readStore() {
  if (!fs.existsSync(FILE)) {
    writeStore({ users:{}, contents:{}, likes:{} });
  }

  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  return decrypt(raw);
}

export function writeStore(data) {
  const encrypted = encrypt(data);
  fs.writeFileSync(FILE, JSON.stringify(encrypted));
}
