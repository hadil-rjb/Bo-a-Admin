import { zonedToUtc } from "../../framer/time";

/**
 * When an automation posts. Days are ISO weekdays (1 = Monday … 7 = Sunday); "weekly" posts on the
 * chosen days, "weekdays" Monday to Friday, "daily" every day. Times are local to the automation's zone.
 */
export type Cadence = { kind: "daily" | "weekdays" | "weekly"; days: number[]; time: string };
export type Occurrence = { date: string; time: string; at: Date };

/** "YYYY-MM-DD" of an instant in a time zone */
export function localDate(ts: number, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}
const addDays = (date: string, n: number) => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
/** ISO weekday of a date: 1 = Monday … 7 = Sunday */
export const isoDay = (date: string) => ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;

export function runsOn(c: Cadence, date: string) {
  const d = isoDay(date);
  if (c.kind === "daily") return true;
  if (c.kind === "weekdays") return d <= 5;
  return (c.days || []).includes(d);
}

/** Runs after `from` up to `to` (instants), within the automation's start / end dates, minus skipped dates */
export function occurrences(a: { cadence: Cadence; tz: string; startDate?: string | null; endDate?: string | null; skip?: string[] }, from: number, to: number, max = 60): Occurrence[] {
  const out: Occurrence[] = [], skip = new Set(a.skip || []);
  let date = localDate(from, a.tz);
  const last = localDate(to, a.tz);
  for (let i = 0; i < 400 && date <= last && out.length < max; i++, date = addDays(date, 1)) {
    if (a.startDate && date < a.startDate) continue;
    if (a.endDate && date > a.endDate) break;
    if (skip.has(date) || !runsOn(a.cadence, date)) continue;
    const at = zonedToUtc(date, a.cadence.time, a.tz);
    if (at.getTime() > from && at.getTime() <= to) out.push({ date, time: a.cadence.time, at });
  }
  return out;
}

/** Fills a caption's fields: {date} {weekday} {week} {headline} {price} {brand} {website} {hashtags} */
export function fillCaption(text: string, v: { date: string; tz: string; lang?: string; headline?: string; price?: string; brand?: string; website?: string; hashtags?: string }) {
  const loc = v.lang === "ar" ? "ar-u-nu-latn" : "en-GB", at = new Date(v.date + "T12:00:00Z");
  const f = (o: Intl.DateTimeFormatOptions, t = at) => new Intl.DateTimeFormat(loc, { timeZone: "UTC", ...o }).format(t);
  const mon = new Date(at.getTime() - (isoDay(v.date) - 1) * 864e5), fri = new Date(mon.getTime() + 4 * 864e5);
  const week = mon.getUTCMonth() === fri.getUTCMonth() ? `${f({ day: "numeric" }, mon)}–${f({ day: "numeric", month: "short" }, fri)}` : `${f({ day: "numeric", month: "short" }, mon)} – ${f({ day: "numeric", month: "short" }, fri)}`;
  const vals: Record<string, string> = {
    date: f({ weekday: "long", day: "numeric", month: "long" }), weekday: f({ weekday: "long" }), week,
    headline: v.headline || "", price: v.price || "", brand: v.brand || "", website: v.website || "", hashtags: v.hashtags || "",
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m)).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
