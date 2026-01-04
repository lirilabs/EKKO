import crypto from "crypto";

const KEY = Buffer.from(process.env.DATA_ENCRYPTION_KEY || "", "hex");

// NEVER throw at import time
if (KEY.length !== 32) {
  console.warn("⚠️ Encryption key invalid or missing");
}

export function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);

  let encrypted = cipher.update(JSON.stringify(obj), "utf8", "base64");
  encrypted += cipher.final("base64");

  return {
    iv: iv.toString("hex"),
    data: encrypted,
    tag: cipher.getAuthTag().toString("hex")
  };
}

export function decryptJSON(payload) {
  // 🔴 CRITICAL GUARD
  if (
    !payload ||
    !payload.iv ||
    !payload.data ||
    !payload.tag
  ) {
    return null; // ← do NOT crash
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      KEY,
      Buffer.from(payload.iv, "hex")
    );

    decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

    let decrypted = decipher.update(payload.data, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  } catch (err) {
    console.warn("⚠️ Decrypt failed, resetting DB");
    return null;
  }
}
