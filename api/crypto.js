import crypto from "crypto";

const KEY = Buffer.from(process.env.DATA_ENCRYPTION_KEY, "hex");
const IV = Buffer.from(process.env.DATA_ENCRYPTION_IV, "hex");

export function encrypt(data) {
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, IV);
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    content: encrypted,
    tag: cipher.getAuthTag().toString("hex")
  };
}

export function decrypt(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, IV);
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

  let decrypted = decipher.update(payload.content, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}
