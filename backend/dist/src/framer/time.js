"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validTz = void 0;
exports.zonedToUtc = zonedToUtc;
/** Convertit « date + heure locales dans un fuseau » en instant UTC (gère l'heure d'été). */
function offset(ts, tz) {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ts));
    const g = (t) => +p.find(x => x.type === t).value;
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ts;
}
function zonedToUtc(date, time, tz) {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = (time || "09:00").split(":").map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    let t = wall;
    for (let i = 0; i < 2; i++)
        t = wall - offset(t, tz);
    return new Date(t);
}
const validTz = (tz) => { try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
}
catch {
    return false;
} };
exports.validTz = validTz;
