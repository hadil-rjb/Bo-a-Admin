import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
const key = (s: string) => createHash("sha256").update(s).digest();
/** AES-256-GCM — sert à chiffrer le refresh token Google en base */
export function encrypt(text: string, secret: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const e = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), e].map(b => b.toString("base64")).join(".");
}
export function decrypt(payload: string, secret: string) {
  const [iv, tag, e] = payload.split(".").map(x => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(e), d.final()]).toString("utf8");
}
