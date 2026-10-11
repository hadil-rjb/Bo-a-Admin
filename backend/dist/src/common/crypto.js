"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = require("crypto");
const key = (s) => (0, crypto_1.createHash)("sha256").update(s).digest();
/** AES-256-GCM — sert à chiffrer le refresh token Google en base */
function encrypt(text, secret) {
    const iv = (0, crypto_1.randomBytes)(12);
    const c = (0, crypto_1.createCipheriv)("aes-256-gcm", key(secret), iv);
    const e = Buffer.concat([c.update(text, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), e].map(b => b.toString("base64")).join(".");
}
function decrypt(payload, secret) {
    const [iv, tag, e] = payload.split(".").map(x => Buffer.from(x, "base64"));
    const d = (0, crypto_1.createDecipheriv)("aes-256-gcm", key(secret), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(e), d.final()]).toString("utf8");
}
