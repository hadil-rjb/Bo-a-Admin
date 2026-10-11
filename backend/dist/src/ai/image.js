"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sniff = void 0;
exports.fetchImage = fetchImage;
const promises_1 = require("dns/promises");
const net_1 = require("net");
const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\.|^2[3-5]\d\./];
const blockedIp = (ip) => {
    if (ip.includes(":")) {
        const l = ip.toLowerCase().replace(/^::ffff:/, "");
        return l === "::1" || l === "::" || /^f[cd]/.test(l) || l.startsWith("fe80") || (!l.includes(":") && PRIVATE_V4.some(r => r.test(l)));
    }
    return PRIVATE_V4.some(r => r.test(ip));
};
/** Refuse tout ce qui n'est pas http(s) public : le serveur ne doit jamais atteindre le réseau interne (SSRF) */
async function assertPublic(u) {
    if (!/^https?:$/.test(u.protocol) || (u.port && !["80", "443"].includes(u.port)) || u.username || u.password)
        throw new Error("blocked");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const addrs = (0, net_1.isIP)(host) ? [{ address: host }] : await (0, promises_1.lookup)(host, { all: true });
    if (!addrs.length || addrs.some(a => blockedIp(a.address)))
        throw new Error("blocked");
}
const sniff = (b) => {
    if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
        return "image/png";
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
        return "image/jpeg";
    if (b.length > 6 && b.toString("latin1", 0, 3) === "GIF")
        return "image/gif";
    if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP")
        return "image/webp";
    return null;
};
exports.sniff = sniff;
async function download(url, max) {
    let u = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
        await assertPublic(u);
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10_000);
        try {
            const res = await fetch(u, { redirect: "manual", signal: ctl.signal, headers: { Accept: "image/*" } });
            if (res.status >= 300 && res.status < 400) {
                const loc = res.headers.get("location");
                if (!loc)
                    return null;
                u = new URL(loc, u);
                continue;
            }
            if (!res.ok || !res.body)
                return null;
            if (Number(res.headers.get("content-length") ?? 0) > max)
                return null;
            const chunks = [];
            let n = 0;
            const reader = res.body.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                n += value.length;
                if (n > max) {
                    await reader.cancel();
                    return null;
                }
                chunks.push(Buffer.from(value));
            }
            return Buffer.concat(chunks);
        }
        finally {
            clearTimeout(t);
        }
    }
    return null;
}
/** Charge une image de couverture (URL publique ou data URL) pour l'analyse visuelle. Renvoie null si inutilisable. */
async function fetchImage(raw, max = 3_000_000) {
    try {
        const d = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/i.exec(raw.trim());
        let buf;
        if (d)
            buf = Buffer.from(d[2], "base64");
        else {
            const u = new URL(raw);
            if (/(^|\.)framerusercontent\.com$/i.test(u.hostname) && !u.search) { // le CDN Framer sait réduire l'image : moins lourd pour le modèle
                buf = await download(`${raw}?scale-down-to=1024`, max).catch(() => null);
                if (!buf)
                    buf = await download(raw, max);
            }
            else
                buf = await download(raw, max);
        }
        if (!buf || buf.length > max)
            return null;
        const media = (0, exports.sniff)(buf);
        return media ? { media, data: buf.toString("base64"), bytes: buf } : null;
    }
    catch {
        return null;
    }
}
