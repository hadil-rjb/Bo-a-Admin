"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapRatio = void 0;
exports.coverProfile = coverProfile;
exports.paletteMatch = paletteMatch;
const sharp_1 = __importDefault(require("sharp"));
const PRESETS = [["1:1", 1], ["5:4", 1.25], ["4:3", 4 / 3], ["3:2", 1.5], ["16:10", 1.6], ["16:9", 16 / 9], ["2:1", 2], ["21:9", 21 / 9], ["3:1", 3]];
const snapRatio = (a) => {
    const best = PRESETS.reduce((p, c) => (Math.abs(c[1] - a) < Math.abs(p[1] - a) ? c : p));
    return Math.abs(best[1] - a) / a <= 0.035 ? best[0] : `${Math.round(a * 100) / 100}:1`;
};
exports.snapRatio = snapRatio;
const hex = (c) => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
/** Couleurs dominantes d'une image : seaux de 4 bits par canal, pondérés par la saturation pour ne pas perdre un accent peu étendu */
async function palette(buf, n = 6) {
    const { data } = await (0, sharp_1.default)(buf, { failOn: "none" }).resize(48, 48, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const B = new Map();
    for (let i = 0; i + 2 < data.length; i += 3) {
        const r = data[i], g = data[i + 1], b = data[i + 2], k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const e = B.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n++;
        e.r += r;
        e.g += g;
        e.b += b;
        B.set(k, e);
    }
    const cand = [...B.values()].map(e => {
        const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        return { r, g, b, score: e.n * (1 + 2 * (mx ? (mx - mn) / mx : 0)) };
    }).sort((a, b) => b.score - a.score);
    const out = [];
    for (const c of cand) {
        if (out.every(o => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) > 60))
            out.push(c);
        if (out.length >= n)
            break;
    }
    return out.map(hex);
}
/** Profil MESURÉ sur les pixels des couvertures existantes (ratio + palette), indépendant de l'interprétation du modèle */
async function coverProfile(bufs) {
    const ratios = [], B = new Map();
    for (const buf of bufs) {
        try {
            const m = await (0, sharp_1.default)(buf, { failOn: "none" }).metadata();
            if (m.width && m.height)
                ratios.push(m.width / m.height);
            for (const h of await palette(buf, 8)) {
                const c = rgb(h), k = ((c.r >> 4) << 8) | ((c.g >> 4) << 4) | (c.b >> 4), e = B.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
                e.n++;
                e.r += c.r;
                e.g += c.g;
                e.b += c.b;
                B.set(k, e);
            }
        }
        catch { /* image illisible : ignorée */ }
    }
    if (!ratios.length)
        return null;
    ratios.sort((a, b) => a - b);
    const aspect = ratios[Math.floor(ratios.length / 2)];
    const merged = [...B.values()].map(e => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n })).sort((a, b) => b.n - a.n);
    const pal = [];
    for (const c of merged) {
        if (pal.every(o => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) > 60))
            pal.push(c);
        if (pal.length >= 6)
            break;
    }
    return { ratio: (0, exports.snapRatio)(aspect), aspect: Math.round(aspect * 1000) / 1000, palette: pal.map(hex), samples: bufs.length };
}
/** 0–100 : proximité de la palette d'une image avec celle des couvertures existantes (pondérée : couleurs dominantes d'abord) */
async function paletteMatch(ref, img) {
    if (!ref?.length)
        return null;
    const cand = (await palette(img, 6)).map(rgb);
    if (!cand.length)
        return null;
    let tot = 0, wsum = 0;
    ref.slice(0, 4).forEach((h, i) => {
        const c = rgb(h), d = Math.min(...cand.map(o => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b))), w = 4 - i;
        tot += w * Math.max(0, 1 - d / 180);
        wsum += w;
    });
    return Math.round((tot / wsum) * 100);
}
