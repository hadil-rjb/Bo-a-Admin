import { createHash } from "crypto";
import { zonedToUtc } from "../../framer/time";
import { arabicName, englishName } from "./names";

/**
 * Economic calendar feeds (ported from AutoCalendar's providers):
 * - TradingView's public calendar: actual / forecast / previous, importance, every country.
 * - Forex Factory's weekly export (faireconomy.media): fallback, current week only, no actuals.
 * Both are cached in memory so repeated previews and auto-updates don't hammer them.
 */

export type Impact = "high" | "medium" | "low";
export type Source = "tradingview" | "forexfactory";

export type CalendarEvent = {
  id: string;
  source: Source;
  /** ISO instant */
  at: string;
  country: string;
  currency: string;
  /** Feed title, e.g. "Core Inflation Rate MoM" */
  title: string;
  /** Display names: "US Core Inflation Rate (MoM)" / Arabic */
  en: string;
  ar: string;
  /** false when the Arabic name fell back to English */
  translated: boolean;
  impact: Impact;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  period: string;
};

export const COUNTRY_CODES = ["US", "EU", "GB", "JP", "CN", "CA", "AU", "NZ", "CH", "DE", "FR", "IT", "ES"];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** Shared in-flight promise per key: concurrent callers wait on one upstream request */
function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>;
  const value = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

const named = (e: Omit<CalendarEvent, "en" | "ar" | "translated">): CalendarEvent => {
  const ar = arabicName(e);
  return { ...e, en: englishName(e), ar: ar.name, translated: ar.translated };
};

/** 0.4 + "%" → "0.4%"; 1.2345 + "B" → "1.23B" */
function value(v: unknown, unit = "", scale = ""): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number") return String(v).trim() || null;
  const n = Math.abs(v) >= 100 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return `${n}${scale || ""}${unit === "%" ? "%" : ""}`;
}

/* ---------- TradingView ---------- */
const TV_IMPACT: Record<string, Impact> = { "1": "high", "0": "medium", "-1": "low" };

async function tradingView(from: Date, to: Date, countries: string[]): Promise<CalendarEvent[]> {
  const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), countries: countries.join(",") });
  const json: any = await cached(`tv:${qs}`, 60_000, () =>
    fetchJson(`https://economic-calendar.tradingview.com/events?${qs}`, { Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" }),
  );
  if (json?.status !== "ok" || !Array.isArray(json.result)) throw new Error("TradingView: unexpected response");
  return json.result
    .filter((e: any) => e && e.title && e.date)
    .map((e: any) => named({
      id: `tv-${e.id}`,
      source: "tradingview",
      at: new Date(e.date).toISOString(),
      country: e.country,
      currency: e.currency || "",
      title: String(e.title).trim(),
      impact: TV_IMPACT[String(e.importance)] || "low",
      actual: value(e.actual, e.unit, e.scale),
      forecast: value(e.forecast, e.unit, e.scale),
      previous: value(e.previous, e.unit, e.scale),
      period: e.period || "",
    }));
}

/* ---------- Forex Factory ---------- */
const FF_COUNTRY: Record<string, string> = { USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", CNY: "CN", CAD: "CA", AUD: "AU", NZD: "NZ", CHF: "CH" };
const FF_IMPACT: Record<string, Impact> = { High: "high", Medium: "medium", Low: "low" };

async function forexFactory(from: Date, to: Date, countries: string[]): Promise<CalendarEvent[]> {
  const rows: any = await cached("ff:week", 10 * 60_000, () => fetchJson("https://nfs.faireconomy.media/ff_calendar_thisweek.json"));
  if (!Array.isArray(rows)) throw new Error("Forex Factory: unexpected response");
  return rows
    .map((r: any) => ({ r, country: FF_COUNTRY[r.country], at: new Date(r.date) }))
    .filter(({ country, at }) => country && countries.includes(country) && at >= from && at <= to)
    .map(({ r, country, at }) => named({
      id: "ff-" + createHash("md5").update(`${r.country}|${r.title}|${r.date}`).digest("hex").slice(0, 12),
      source: "forexfactory",
      at: at.toISOString(),
      country,
      currency: r.country,
      title: String(r.title || "").trim(),
      impact: FF_IMPACT[r.impact] || "low",
      actual: value(r.actual),
      forecast: value(r.forecast),
      previous: value(r.previous),
      period: "",
    }));
}

const RANK: Record<Impact, number> = { high: 3, medium: 2, low: 1 };
const PROVIDERS: Record<Source, (from: Date, to: Date, countries: string[]) => Promise<CalendarEvent[]>> = { tradingview: tradingView, forexfactory: forexFactory };

/**
 * Events of one local day (`date` in `tz`), in time order. Tries the preferred source first and
 * falls back to the other one; `errors` lists what failed.
 */
export async function dayEvents(date: string, tz: string, countries: string[], prefer: Source = "tradingview") {
  const from = zonedToUtc(date, "00:00", tz), to = new Date(zonedToUtc(date, "23:59", tz).getTime() + 59_999);
  const order: Source[] = prefer === "forexfactory" ? ["forexfactory", "tradingview"] : ["tradingview", "forexfactory"];
  const errors: string[] = [];
  for (const source of order) {
    try {
      const events = (await PROVIDERS[source](from, to, countries))
        .sort((a, b) => a.at.localeCompare(b.at) || RANK[b.impact] - RANK[a.impact]);
      return { events, source, errors, fetchedAt: new Date().toISOString() };
    } catch (e: any) {
      errors.push(`${source}: ${e?.message || e}`);
    }
  }
  throw new Error(`No calendar source answered (${errors.join("; ")})`);
}
