import crypto from "crypto";

const KEY = Buffer.from(process.env.DATA_ENCRYPTION_KEY, "hex");

if (KEY.length !== 32) {
  throw new Error("Invalid DATA_ENCRYPTION_KEY length");
}

// Generate a UNIQUE IV per encryption (REQUIRED for GCM)
function generateIV() {
  return crypto.randomBytes(12); // 96-bit IV (GCM standard)
}

export function encrypt(data) {
  const iv = generateIV();
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);

  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    iv: iv.toString("hex"),
    content: encrypted,
    tag: cipher.getAuthTag().toString("hex")
  };
}

export function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(payload.iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

  let decrypted = decipher.update(payload.content, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}
