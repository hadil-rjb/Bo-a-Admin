import { createHash } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import sharp from "sharp";
import { cached, fetchJson, UA } from "../calendar/feeds";

/**
 * Market feeds for the studio's live templates, no API key needed:
 * - Prices: TradingView's scanner (forex, metals, crypto, indices, stocks); Binance for crypto pairs
 *   when TradingView doesn't answer.
 * - News: RSS feeds (FXStreet, CNBC, MarketWatch) and Google News, which also covers Arabic.
 * Both are cached in memory so previews and auto-updates don't hammer them.
 */

export type Quote = {
  /** TradingView symbol, e.g. "OANDA:XAUUSD" */
  symbol: string;
  name: string;
  price: number;
  /** Change since the previous close, absolute and in % */
  change: number;
  changePct: number;
  high: number | null;
  low: number | null;
  /** Decimals the market quotes with (EUR/USD 5, gold 2…) */
  decimals: number;
  currency: string;
  source: "tradingview" | "binance";
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  /** Publisher, e.g. "Reuters" */
  source: string;
  url: string;
  image: string | null;
  /** ISO instant */
  at: string;
};

export const NEWS_SOURCES = ["fxstreet", "google", "cnbc", "marketwatch"] as const;
export type NewsSource = (typeof NEWS_SOURCES)[number];

const SYMBOL_RE = /^[A-Z0-9_.]{1,20}:[A-Z0-9_.!&-]{1,30}$/;
export const validSymbol = (s: string) => SYMBOL_RE.test(s);

/* ---------- prices ---------- */
const COLUMNS = ["close", "change", "change_abs", "high", "low", "description", "pricescale", "currency"];
const decimalsOf = (scale: unknown) => (typeof scale === "number" && scale > 1 ? Math.round(Math.log10(scale)) : 2);

async function tradingView(symbols: string[]): Promise<Quote[]> {
  const json: any = await cached(`tvq:${symbols.join(",")}`, 30_000, async () => {
    const res = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/json", Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" },
      body: JSON.stringify({ symbols: { tickers: symbols }, columns: COLUMNS }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from scanner.tradingview.com`);
    return res.json();
  });
  if (!Array.isArray(json?.data)) throw new Error("TradingView: unexpected response");
  return json.data
    .filter((r: any) => Array.isArray(r?.d) && typeof r.d[0] === "number")
    .map((r: any): Quote => {
      const [close, pct, abs, high, low, description, scale, currency] = r.d;
      return {
        symbol: r.s, name: String(description || r.s.split(":")[1]), price: close,
        change: typeof abs === "number" ? abs : 0, changePct: typeof pct === "number" ? pct : 0,
        high: typeof high === "number" ? high : null, low: typeof low === "number" ? low : null,
        decimals: decimalsOf(scale), currency: currency || "", source: "tradingview",
      };
    });
}

/** Crypto pairs straight from Binance ("BINANCE:BTCUSDT", or any "…:XXXUSDT") */
async function binance(symbols: string[]): Promise<Quote[]> {
  const pairs = symbols.map((s) => ({ s, pair: s.split(":")[1] })).filter((x) => /^[A-Z0-9]{2,12}(USDT|USDC|BTC|ETH|EUR)$/.test(x.pair));
  const out: Quote[] = [];
  for (const { s, pair } of pairs) {
    const r: any = await cached(`bn:${pair}`, 30_000, () => fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`));
    const price = Number(r?.lastPrice);
    if (!Number.isFinite(price)) continue;
    const dec = String(r.lastPrice).replace(/0+$/, "").split(".")[1]?.length ?? 2;
    out.push({ symbol: s, name: pair, price, change: Number(r.priceChange) || 0, changePct: Number(r.priceChangePercent) || 0, high: Number(r.highPrice) || null, low: Number(r.lowPrice) || null, decimals: Math.min(8, Math.max(2, dec)), currency: pair.replace(/^.*?(USDT|USDC|BTC|ETH|EUR)$/, "$1"), source: "binance" });
  }
  return out;
}

/** Quotes in the order asked; symbols no source knows are left out (`missing`) */
export async function quotes(symbols: string[]) {
  const errors: string[] = [];
  let got: Quote[] = [];
  try { got = await tradingView(symbols); } catch (e: any) { errors.push(`tradingview: ${e?.message || e}`); }
  const left = symbols.filter((s) => !got.some((q) => q.symbol === s));
  if (left.length) {
    try { got = got.concat(await binance(left)); } catch (e: any) { errors.push(`binance: ${e?.message || e}`); }
  }
  if (!got.length) throw new Error(`No price source answered${errors.length ? ` (${errors.join("; ")})` : ""}`);
  const by = new Map(got.map((q) => [q.symbol, q]));
  return { quotes: symbols.map((s) => by.get(s)).filter(Boolean) as Quote[], missing: symbols.filter((s) => !by.has(s)), errors, fetchedAt: new Date().toISOString() };
}

/* ---------- news ---------- */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m));
const plain = (s: string) => decode(decode(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => { const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml); return m ? m[1] : ""; };
const attr = (xml: string, name: string, a: string) => { const m = new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]+)"`, "i").exec(xml); return m ? decode(m[1]) : null; };

function feedUrl(source: NewsSource, q: string, lang: "en" | "ar") {
  if (source === "google" || lang === "ar") {
    const query = encodeURIComponent(q || (lang === "ar" ? "الأسواق المالية OR الذهب OR الدولار" : "forex OR gold OR stocks OR dollar"));
    return lang === "ar" ? `https://news.google.com/rss/search?q=${query}&hl=ar&gl=SA&ceid=SA:ar` : `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  }
  return { fxstreet: "https://www.fxstreet.com/rss/news", cnbc: "https://www.cnbc.com/id/10000664/device/rss/rss.html", marketwatch: "https://feeds.content.dowjones.io/public/rss/mw_topstories" }[source];
}
const PUBLISHER: Record<string, string> = { fxstreet: "FXStreet", cnbc: "CNBC", marketwatch: "MarketWatch" };

function parseRss(xml: string, source: NewsSource): NewsItem[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items.map((it) => {
    const google = source === "google" || /news\.google\.com/.test(tag(it, "link"));
    const publisher = google ? plain(tag(it, "source")) : PUBLISHER[source] || "";
    let title = plain(tag(it, "title"));
    // Google News titles end with " - Publisher"
    if (google && publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3).trim();
    const link = plain(tag(it, "link"));
    const at = new Date(plain(tag(it, "pubDate")) || Date.now());
    return {
      id: "n-" + createHash("md5").update(link || title).digest("hex").slice(0, 12),
      title,
      summary: google ? "" : plain(tag(it, "description")).slice(0, 400),
      source: publisher,
      url: link,
      image: attr(it, "media:content", "url") || attr(it, "media:thumbnail", "url") || attr(it, "enclosure", "url"),
      at: (Number.isNaN(at.getTime()) ? new Date() : at).toISOString(),
    };
  }).filter((n) => n.title);
}

/** Latest headlines, newest first */
export async function news(source: NewsSource, q: string, lang: "en" | "ar", limit: number) {
  const url = feedUrl(source, q, lang);
  const xml = await cached(`news:${url}`, 5 * 60_000, async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return res.text();
  });
  const items = parseRss(xml, source === "google" || lang === "ar" ? "google" : source).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  if (!items.length) throw new Error("The news feed returned no headlines");
  return { items, source: source === "google" || lang === "ar" ? "google" : source, fetchedAt: new Date().toISOString() };
}

/* ---------- headline photos ---------- */
/** Addresses a photo URL must never reach (this server, its network, cloud metadata) */
const PRIVATE = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1?$/, /^f[cd]/i, /^fe80/i, /^::ffff:(10|127|169\.254|192\.168)\./i];
async function publicUrl(raw: string) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error("Only public http(s) pictures");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some((a) => PRIVATE.some((r) => r.test(a)))) throw new Error("This picture's address is not public");
  return u;
}
const photos = new Map<string, Promise<string>>();
/**
 * A headline's photo as a data URL (JPEG, at most 1400 px wide). The studio's exporter can't read
 * pictures from news sites (no CORS), so the slide embeds this copy instead.
 */
export function photo(url: string): Promise<string> {
  const hit = photos.get(url);
  if (hit) return hit;
  const p = (async () => {
    let u = await publicUrl(url), res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(u, { headers: { "User-Agent": UA, Accept: "image/*" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
      const next = res.status >= 300 && res.status < 400 && res.headers.get("location");
      if (!next) break;
      u = await publicUrl(new URL(next, u).href);
    }
    if (!res?.ok) throw new Error(`HTTP ${res?.status} for the picture`);
    if (!/^image\//.test(res.headers.get("content-type") || "")) throw new Error("Not a picture");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 12e6) throw new Error("The picture is too large");
    const out = await sharp(buf).rotate().resize({ width: 1400, withoutEnlargement: true }).flatten({ background: "#0b1220" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  })();
  photos.set(url, p);
  p.catch(() => photos.delete(url));
  if (photos.size > 60) photos.delete(photos.keys().next().value as string); // a small cache: oldest first
  return p;
}
