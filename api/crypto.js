export async function getCrypto(keyHex) {
  if (!keyHex || keyHex.length !== 64) return null;

  const crypto = await import("crypto");
  const key = Buffer.from(keyHex, "hex");

  return {
    encrypt(obj) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

      let enc = cipher.update(JSON.stringify(obj), "utf8", "base64");
      enc += cipher.final("base64");

      return {
        iv: iv.toString("hex"),
        data: enc,
        tag: cipher.getAuthTag().toString("hex")
      };
    },

    decrypt(payload) {
      try {
        if (!payload?.iv || !payload?.data || !payload?.tag) return null;

        const decipher = crypto.createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(payload.iv, "hex")
        );

        decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

        let dec = decipher.update(payload.data, "base64", "utf8");
        dec += decipher.final("utf8");

        return JSON.parse(dec);
      } catch {
        return null;
      }
    }
  };
}
