import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Reads a slide (its layers, plus a small render when available) and finds the economic calendar
 * in it: which text layer is each row's time, currency, event name, values and impact, and which
 * layer shows the date. The studio then rewrites only those texts with live data, so the design
 * itself (colours, fonts, spacing, positions) never changes.
 *
 * Each mapped text keeps its own wording through a template, e.g. "Actual {actual} · Forecast {forecast}".
 * Row placeholders: {time} {currency} {country} {event} {actual} {forecast} {previous} {value} {impact}
 * Date placeholders: {weekday} {day} {month} {year}
 *
 * Two engines produce the same mapping: Claude (when a key is set in Settings → AI) and a
 * layout heuristic (no key, or as a fallback when Claude is unavailable).
 */

export type Layer = {
  id: string; type: string; name?: string; text?: string;
  x: number; y: number; w: number; h: number;
  size?: number; weight?: number | string; color?: string; fill?: string; locked?: boolean; hidden?: boolean;
};

export const ROW_PLACEHOLDERS = ["time", "currency", "country", "event", "actual", "forecast", "previous", "value", "impact"] as const;
export const DATE_PLACEHOLDERS = ["weekday", "day", "month", "year"] as const;

const MappingSchema = z.object({
  isCalendar: z.boolean().describe("true when the slide shows a list of economic calendar events"),
  reason: z.string().describe("One short sentence a designer can read, e.g. '5 rows found: time, currency, event, values and impact.'"),
  date: z.object({
    layerId: z.string(),
    template: z.string().describe("The layer's text with the date parts replaced by {weekday} {day} {month} {year}"),
  }).nullable().describe("The text layer showing the calendar's day, or null"),
  impactSymbol: z.string().nullable().describe("The character repeated to show impact (e.g. ★ or ●), or null when impact is written as a word"),
  rows: z.array(z.object({
    layerIds: z.array(z.string()).describe("Every layer that belongs to this row: its texts plus its background card, badges and dividers"),
    fields: z.array(z.object({
      layerId: z.string(),
      role: z.enum(ROW_PLACEHOLDERS).describe("The main kind of data this text shows"),
      template: z.string().describe("The layer's text with its data replaced by placeholders; keep labels and separators, e.g. 'Actual {actual} · Forecast {forecast}'"),
    })),
  })).describe("One entry per calendar row, top to bottom"),
});
export type Mapping = z.infer<typeof MappingSchema> & { engine: "claude" | "heuristic"; model?: string };

/* ---------------- sanitizing (both engines) ---------------- */

const PH = /\{(\w+)\}/g;
const hasPh = (t: string, allowed: readonly string[]) => [...t.matchAll(PH)].some((m) => allowed.includes(m[1]));

/** Drops ids that aren't on the slide, templates without a usable placeholder, empty rows; orders rows top to bottom */
export function sanitize(m: Omit<Mapping, "engine">, layers: Layer[]): Omit<Mapping, "engine"> {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const isText = (id: string) => byId.get(id)?.type === "text";
  const rows = m.rows
    .map((r) => {
      const fields = r.fields.filter((f) => isText(f.layerId) && hasPh(f.template, ROW_PLACEHOLDERS));
      const ids = [...new Set([...r.layerIds.filter((id) => byId.has(id)), ...fields.map((f) => f.layerId)])];
      return { layerIds: ids, fields };
    })
    .filter((r) => r.fields.length)
    .sort((a, b) => top(a, byId) - top(b, byId));
  const date = m.date && isText(m.date.layerId) && hasPh(m.date.template, DATE_PLACEHOLDERS) ? m.date : null;
  return { ...m, rows, date, isCalendar: m.isCalendar && rows.length > 0 };
}
const top = (r: { fields: { layerId: string }[] }, byId: Map<string, Layer>) => Math.min(...r.fields.map((f) => byId.get(f.layerId)?.y ?? 0));

/* ---------------- heuristic engine ---------------- */

const TIME_RE = /^\s*\d{1,2}[:.]\d{2}\s*(am|pm)?\s*$/i;
const CUR_RE = /^\s*(USD|EUR|GBP|JPY|CAD|AUD|NZD|CHF|CNY|CNH|SEK|NOK|MXN|ZAR|TRY|INR|KRW|SGD|HKD)\s*$/i;
const WORD_IMPACT_RE = /^\s*(high|medium|med|low|عالي|عالية|متوسط|متوسطة|منخفض|منخفضة)\s*$/i;
const NUM = String.raw`[-+]?\d[\d.,]*\s*[%KMBTkmbt]?`;
const VALUE_RE = new RegExp(`^\\s*${NUM}\\s*$`);
const LABELS: [RegExp, string][] = [
  [/(actual|act\.?|الفعلي|فعلي)/i, "actual"],
  [/(forecast|fcst\.?|consensus|cons\.?|exp\.?|expected|المتوقع|متوقع|التوقع)/i, "forecast"],
  [/(previous|prev\.?|prior|السابق|سابق)/i, "previous"],
];
const WEEKDAYS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b|(الإثنين|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد)/gi;
const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)/gi;

const cx = (l: Layer) => l.x + l.w / 2, cy = (l: Layer) => l.y + l.h / 2;
const inside = (outer: Layer, x: number, y: number) => x >= outer.x && x <= outer.x + outer.w && y >= outer.y && y <= outer.y + outer.h;
const isSymbolRun = (t: string) => { const s = [...t.trim()]; return s.length > 0 && s.length <= 5 && !/[\p{L}\p{N}]/u.test(s[0]) && s.every((c) => c === s[0] || /[☆○◇□△✧·]/u.test(c)); };

/** "Actual 0.4% · Forecast 0.3%" → "Actual {actual} · Forecast {forecast}" */
function valueTemplate(text: string): string | null {
  if (VALUE_RE.test(text)) return "{value}";
  let t = text, hit = false;
  for (const [label, ph] of LABELS) {
    t = t.replace(new RegExp(`(${label.source})(\\s*:?\\s*)(${NUM})`, "i"), (_m, a, _b, s) => { hit = true; return `${a}${s}{${ph}}`; });
  }
  return hit ? t : null;
}

/** "Tuesday, 20 October 2026" → "{weekday}, {day} {month} {year}" */
function dateTemplate(text: string): string | null {
  const wd = text.match(WEEKDAYS), mo = text.match(MONTHS), num = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.test(text);
  if (!mo && !num && !wd) return null;
  if (num) return text.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, "{day} {month} {year}");
  let t = text.replace(WEEKDAYS, "{weekday}").replace(MONTHS, "{month}").replace(/\b(19|20)\d{2}\b|[١٢][٠-٩]{3}/, "{year}");
  t = t.replace(/(^|[^\d{])(\d{1,2}|[٠-٩]{1,2})(?=[^\d}]|$)/, "$1{day}");
  return /\{(month|weekday)\}/.test(t) ? t : null;
}

export function heuristic(layers: Layer[], w: number, h: number): Omit<Mapping, "engine"> {
  const vis = layers.filter((l) => !l.hidden);
  const texts = vis.filter((l) => l.type === "text" && (l.text || "").trim());
  const times = texts.filter((l) => TIME_RE.test(l.text!)).sort((a, b) => cy(a) - cy(b));
  if (times.length < 2) return { isCalendar: false, reason: "No calendar rows found: a calendar needs at least two times like 13:30.", date: null, impactSymbol: null, rows: [] };

  // each time anchors a row; a text belongs to the row whose band contains its centre
  const bands = times.map((t, i) => {
    const prev = times[i - 1], next = times[i + 1], gap = Math.min(prev ? cy(t) - cy(prev) : Infinity, next ? cy(next) - cy(t) : Infinity);
    const half = Number.isFinite(gap) ? gap / 2 : t.h * 1.5;
    return { time: t, lo: cy(t) - half, hi: cy(t) + half };
  });
  const used = new Set<string>(times.map((t) => t.id));
  let impactSymbol: string | null = null;
  const rows = bands.map(({ time, lo, hi }) => {
    const fields: Mapping["rows"][number]["fields"] = [{ layerId: time.id, role: "time", template: "{time}" }];
    const mine = texts.filter((l) => !used.has(l.id) && cy(l) >= lo && cy(l) < hi);
    const rest: Layer[] = [];
    for (const l of mine) {
      const t = l.text!.trim();
      if (CUR_RE.test(t)) fields.push({ layerId: l.id, role: "currency", template: "{currency}" });
      else if (isSymbolRun(t)) { impactSymbol = impactSymbol || [...t][0]; fields.push({ layerId: l.id, role: "impact", template: "{impact}" }); }
      else if (WORD_IMPACT_RE.test(t)) fields.push({ layerId: l.id, role: "impact", template: "{impact}" });
      else rest.push(l);
      used.add(l.id);
    }
    // the longest wording is the event name; texts with figures become value templates
    const valued = rest.map((l) => ({ l, tpl: valueTemplate(l.text!) }));
    const words = valued.filter((v) => !v.tpl).sort((a, b) => b.l.text!.length - a.l.text!.length);
    if (words[0]) fields.push({ layerId: words[0].l.id, role: "event", template: "{event}" });
    valued.filter((v) => v.tpl).forEach((v) => fields.push({ layerId: v.l.id, role: v.tpl === "{value}" ? "value" : "actual", template: v.tpl! }));
    // shapes behind the row (card, currency badge, dividers)
    const shapes = vis.filter((s) => s.type !== "text" && !(s.locked && s.w >= w * 0.98 && s.h >= h * 0.98) && cy(s) >= lo && cy(s) < hi && s.h <= (hi - lo) * 1.6);
    return { layerIds: [...mine.map((l) => l.id), time.id, ...shapes.map((s) => s.id)], fields };
  });

  const dateLayer = texts.filter((l) => !used.has(l.id) && dateTemplate(l.text!)).sort((a, b) => Math.abs(cy(a) - cy(times[0])) - Math.abs(cy(b) - cy(times[0])))[0];
  const kinds = new Set(rows.flatMap((r) => r.fields.map((f) => f.role)));
  return {
    isCalendar: true,
    reason: `${rows.length} rows found: ${[...kinds].join(", ")}.`,
    date: dateLayer ? { layerId: dateLayer.id, template: dateTemplate(dateLayer.text!)! } : null,
    impactSymbol,
    rows,
  };
}

/* ---------------- Claude engine ---------------- */

export const ANALYZE_MODEL = "claude-opus-5-5";

const SYSTEM = `You analyse social media slides for a design studio and find economic calendar tables in them.

You get the slide's layers as JSON (id, type, name, text, position and size in pixels, font size and colour) and usually a picture of the slide. Text layers can be edited; shapes are backgrounds, cards, badges and dividers.

Decide whether the slide shows a list of economic calendar events (release times, currencies or countries, indicator names, actual/forecast/previous values, impact). If it does, describe every row, top to bottom:
- "fields": each text layer of the row that shows data, with its role and a template. The template is the layer's exact text with the data replaced by placeholders: {time} {currency} {country} {event} {actual} {forecast} {previous} {value} {impact}. Keep labels, punctuation and separators exactly as written, e.g. "Actual 0.4% · Forecast 0.3%" becomes "Actual {actual} · Forecast {forecast}". Use {value} for a lone figure without a label. A time like 13:30 is "{time}"; a currency code is "{currency}"; stars or dots showing impact are "{impact}".
- "layerIds": every layer that belongs to the row, including its background card, badges and dividers, so the row can be hidden when there are fewer events than rows.
Text that stays the same on every post (titles, headings, column headers, brand name, website, legal notes) is not a field.

If one text layer shows the calendar's day, return it as "date" with a template using {weekday} {day} {month} {year}, keeping the original order and separators. Set "impactSymbol" to the repeated character used for impact (e.g. ★), or null.

Only use layer ids from the input. If the slide is not a calendar, return isCalendar false with no rows. "reason" is one short sentence for the designer.`;

function compactLayers(layers: Layer[]) {
  return layers.filter((l) => !l.hidden).map((l) => ({
    id: l.id, type: l.type, ...(l.name ? { name: l.name } : {}), ...(l.type === "text" ? { text: (l.text || "").slice(0, 300) } : {}),
    x: Math.round(l.x), y: Math.round(l.y), w: Math.round(l.w), h: Math.round(l.h),
    ...(l.size ? { size: l.size } : {}), ...(l.weight ? { weight: l.weight } : {}), ...(l.color ? { color: l.color } : {}),
  }));
}

/** Claude's reading of the slide. Throws when the request fails, so the caller can fall back. */
export async function analyzeWithClaude(apiKey: string, input: { layers: Layer[]; w: number; h: number; image?: string }) {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });
  const img = input.image && /^data:image\/(png|jpeg|webp);base64,/.exec(input.image);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (img) content.push({ type: "image", source: { type: "base64", media_type: `image/${img[1]}` as "image/png" | "image/jpeg" | "image/webp", data: input.image!.slice(img[0].length) } });
  content.push({ type: "text", text: `Canvas: ${input.w}×${input.h} px.\nLayers (bottom to top):\n${JSON.stringify(compactLayers(input.layers))}` });

  const res = await client.beta.messages.create({
    model: ANALYZE_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(MappingSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined to analyse this slide");
  if (res.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = MappingSchema.parse(JSON.parse(text));
  return { mapping: sanitize(parsed, input.layers), model: res.model };
}
