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
 * Row placeholders: {time} {currency} {country} {flag} {event} {actual} {forecast} {previous} {value} {impact}
 * Date placeholders: {weekday} {day} {month} {year}; time zone label: {tz}
 * {flag} goes on an image layer (the country flag); every other placeholder on text.
 *
 * Two engines produce the same mapping: Claude (when a key is set in Settings → AI) and a
 * layout heuristic (no key, or as a fallback when Claude is unavailable).
 */

export type Layer = {
  id: string; type: string; name?: string; text?: string;
  x: number; y: number; w: number; h: number;
  size?: number; weight?: number | string; color?: string; fill?: string; locked?: boolean; hidden?: boolean;
};

export const ROW_PLACEHOLDERS = ["time", "currency", "country", "flag", "event", "actual", "forecast", "previous", "value", "impact"] as const;
export const DATE_PLACEHOLDERS = ["weekday", "day", "month", "year"] as const;

const MappingSchema = z.object({
  isCalendar: z.boolean().describe("true when the slide shows a list of economic calendar events"),
  reason: z.string().describe("One short sentence a designer can read, e.g. '5 rows found: time, currency, event, values and impact.'"),
  date: z.object({
    layerId: z.string(),
    template: z.string().describe("The layer's text with the date parts replaced by {weekday} {day} {month} {year}"),
  }).nullable().describe("The text layer showing the calendar's day, or null"),
  tz: z.object({
    layerId: z.string(),
    template: z.string().describe("The layer's text with the time zone replaced by {tz}, e.g. 'Times in {tz}'"),
  }).nullable().describe("The text layer naming the time zone (e.g. 'GMT+4'), or null"),
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
  const isPic = (id: string) => ["image", "rect", "ellipse"].includes(byId.get(id)?.type || "");
  const rows = m.rows
    .map((r) => {
      const fields = r.fields
        .map((f) => (f.role === "flag" ? { ...f, template: "{flag}" } : f))
        .filter((f) => (f.role === "flag" ? isPic(f.layerId) : isText(f.layerId) && hasPh(f.template, ROW_PLACEHOLDERS)));
      const ids = [...new Set([...r.layerIds.filter((id) => byId.has(id)), ...fields.map((f) => f.layerId)])];
      return { layerIds: ids, fields };
    })
    .filter((r) => r.fields.length)
    .sort((a, b) => top(a, byId) - top(b, byId));
  const date = m.date && isText(m.date.layerId) && hasPh(m.date.template, DATE_PLACEHOLDERS) ? m.date : null;
  const tz = m.tz && isText(m.tz.layerId) && m.tz.template.includes("{tz}") ? m.tz : null;
  return { ...m, rows, date, tz, isCalendar: m.isCalendar && rows.length > 0 };
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
  if (times.length < 2) return { isCalendar: false, reason: "No calendar rows found: a calendar needs at least two times like 13:30.", date: null, tz: null, impactSymbol: null, rows: [] };

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
      else if (isSymbolRun(t)) {
        // two ratings on top of each other: the one behind is the empty "track", it stays as designed
        const front = mine.filter((o) => o !== l && isSymbolRun(o.text!) && Math.abs(o.x - l.x) < l.w * 0.5 && vis.indexOf(o) > vis.indexOf(l));
        if (!front.length) { impactSymbol = impactSymbol || [...t][0]; fields.push({ layerId: l.id, role: "impact", template: "{impact}" }); }
      }
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
    // a small, roughly square picture in the row is its country flag
    const flag = shapes.find((s) => s.type === "image" && s.w <= (hi - lo) * 1.2 && Math.abs(s.w - s.h) <= Math.max(s.w, s.h) * 0.35 && s.x < (time.x + w) / 2);
    if (flag) fields.push({ layerId: flag.id, role: "flag", template: "{flag}" });
    return { layerIds: [...mine.map((l) => l.id), time.id, ...shapes.map((s) => s.id)], fields };
  });

  const dateLayer = texts.filter((l) => !used.has(l.id) && dateTemplate(l.text!) && !/[-–—]/.test(l.text!)).sort((a, b) => Math.abs(cy(a) - cy(times[0])) - Math.abs(cy(b) - cy(times[0])))[0];
  const TZ_RE = /\b(GMT|UTC)\s*[+-]\s*\d{1,2}(:\d{2})?\b|\b(GMT|UTC)\b/i;
  const tzLayer = texts.find((l) => !used.has(l.id) && l !== dateLayer && TZ_RE.test(l.text!) && l.text!.length < 40);
  const kinds = new Set(rows.flatMap((r) => r.fields.map((f) => f.role)));
  return {
    isCalendar: true,
    reason: `${rows.length} rows found: ${[...kinds].join(", ")}.`,
    date: dateLayer ? { layerId: dateLayer.id, template: dateTemplate(dateLayer.text!)! } : null,
    tz: tzLayer ? { layerId: tzLayer.id, template: tzLayer.text!.replace(TZ_RE, "{tz}") } : null,
    impactSymbol,
    rows,
  };
}

/* ---------------- Claude engine ---------------- */

export const ANALYZE_MODEL = "claude-opus-5-5";

const SYSTEM = `You analyse social media slides for a design studio and find economic calendar tables in them.

You get the slide's layers as JSON (id, type, name, text, position and size in pixels, font size and colour) and usually a picture of the slide. Text layers can be edited; shapes are backgrounds, cards, badges and dividers.

Decide whether the slide shows a list of economic calendar events (release times, currencies or countries, indicator names, actual/forecast/previous values, impact). If it does, describe every row, top to bottom:
- "fields": each text layer of the row that shows data, with its role and a template. The template is the layer's exact text with the data replaced by placeholders: {time} {currency} {country} {event} {actual} {forecast} {previous} {value} {impact}. A country flag picture in the row is a field too: role "flag", template "{flag}". Keep labels, punctuation and separators exactly as written, e.g. "Actual 0.4% · Forecast 0.3%" becomes "Actual {actual} · Forecast {forecast}". Use {value} for a lone figure without a label. A time like 13:30 is "{time}"; a currency code is "{currency}"; stars or dots showing impact are "{impact}".
- "layerIds": every layer that belongs to the row, including its background card, badges and dividers, so the row can be hidden when there are fewer events than rows.
Text that stays the same on every post (titles, headings, column headers, brand name, website, legal notes) is not a field. When a rating is drawn twice on top of itself (all symbols in a faint colour behind, the filled ones in front), only the front layer is the impact field.

If one text layer shows the calendar's day, return it as "date" with a template using {weekday} {day} {month} {year}, keeping the original order and separators. If a text layer names the time zone (e.g. "GMT+4"), return it as "tz" with the time zone replaced by {tz}. Set "impactSymbol" to the repeated character used for impact (e.g. ★), or null.

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

/* ---------------- importing a picture as editable layers ---------------- */

/** Fonts the studio ships; Claude picks the closest one */
export const STUDIO_FONTS = ["Inter", "Plus Jakarta Sans", "Poppins", "Montserrat", "DM Sans", "Space Grotesk", "Playfair Display", "Cairo", "Tajawal"] as const;

const ImportSchema = z.object({
  background: z.string().describe("CSS background of the whole design: a hex colour or a CSS linear-/radial-gradient matching the picture"),
  layers: z.array(z.object({
    kind: z.enum(["text", "rect", "ellipse", "image"]).describe("text: any readable text; rect/ellipse: flat or gradient shapes (cards, badges, pills, dividers, buttons); image: photos, illustrations, logos, icons, charts or anything that can't be drawn as a flat shape - it is cropped from the picture"),
    name: z.string().describe("Short layer name, e.g. 'Title', 'Row 2 card', 'USD badge', 'Logo'"),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    text: z.string().nullable().describe("For text: the exact text, with \\n between lines exactly as wrapped in the picture"),
    font: z.enum(STUDIO_FONTS).nullable(),
    size: z.number().nullable().describe("Font size in picture pixels (cap height ≈ 0.7 × size)"),
    weight: z.number().nullable().describe("400, 500, 600, 700 or 800"),
    color: z.string().nullable().describe("Text colour, hex"),
    align: z.enum(["left", "center", "right"]).nullable(),
    letterSpacing: z.number().nullable().describe("Extra spacing between letters in px, e.g. 4 for spaced capitals, else 0"),
    fill: z.string().nullable().describe("Shape fill: hex, rgba(...) or a CSS gradient"),
    radius: z.number().nullable().describe("Corner radius in px"),
    stroke: z.string().nullable().describe("Border colour, or null"),
  })).describe("Every element, from back to front (backgrounds first, text last)"),
});
export type ImportedDesign = z.infer<typeof ImportSchema>;

const IMPORT_SYSTEM = `You turn a picture of a social media design into editable layers for a design studio, so it can be edited and reused as a template. Reproduce the design as faithfully as possible.

Coordinates are in pixels of the picture you receive (origin top-left). For every element give a tight bounding box.
- Text: one layer per text block that shares one style; keep the exact wording and line breaks. Estimate font size from the glyph height, the weight, colour, alignment and letter spacing, and pick the closest font from the list (Arabic text: Cairo or Tajawal).
- Shapes: cards, rows, badges, pills, buttons, dividers and flat decorative blobs as rect or ellipse with their colour (use rgba for translucent cards over a background, CSS gradients where you see them) and corner radius.
- Images: photos, people, logos, flags, charts and textured or 3D artwork as kind "image": the studio crops that area from the picture, so draw its box tightly around the element alone, and give round ones (circular flags, avatars) a radius of half their width. Never let an image box cover text or rows: everything inside it is copied as pixels and would show behind the new layers.
- Soft glows, blurred light and colour washes are not images: draw them as rect or ellipse layers with a CSS radial-gradient or linear-gradient fill (with transparency) at the right place, or include them in the background gradient.
- Star or dot ratings: two text layers at exactly the same box and style: first (behind) all the symbols in the empty colour, then (in front) only the filled symbols in the filled colour, e.g. "★★★" dark and "★★" green. Use the ★ character for stars.
- Background: the design's base colour or gradient; don't add it as a layer.
Order layers back to front. Don't skip small texts such as dates, footers, website addresses or star ratings.`;

/** Claude's rebuild of a picture. Throws when the request fails. */
export async function importWithClaude(apiKey: string, input: { image: string; imgW: number; imgH: number }) {
  const m = /^data:image\/(png|jpeg|webp);base64,/.exec(input.image);
  if (!m) throw new Error("Expected a PNG, JPEG or WebP image");
  const client = new Anthropic({ apiKey, timeout: 300_000, maxRetries: 1 });
  // long structured answers: stream, then read the final message
  const stream = client.beta.messages.stream({
    model: ANALYZE_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: zodOutputFormat(ImportSchema) },
    system: [{ type: "text", text: IMPORT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: `image/${m[1]}` as "image/png" | "image/jpeg" | "image/webp", data: input.image.slice(m[0].length) } },
      { type: "text", text: `The picture is ${input.imgW}×${input.imgH} px. Rebuild it as layers.` },
    ] }],
  });
  const res = await stream.finalMessage();
  if (res.stop_reason === "refusal") throw new Error("Claude declined to read this picture");
  if (res.stop_reason === "max_tokens") throw new Error("The design is too detailed to rebuild in one pass");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const design = ImportSchema.parse(JSON.parse(text));
  // keep boxes inside the picture
  const cl = (v: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0));
  design.layers = design.layers
    .map((l) => ({ ...l, x: cl(l.x, input.imgW), y: cl(l.y, input.imgH), w: cl(l.w, input.imgW), h: cl(l.h, input.imgH) }))
    .filter((l) => l.w > 1 && l.h > 1 && (l.kind !== "text" || (l.text || "").trim()));
  return { design, model: res.model };
}
