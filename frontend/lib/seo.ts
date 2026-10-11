import { Article } from "./types";
const pad = (n: number) => String(n).padStart(2, "0");
export const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ds(new Date());
export const ago = (a: Article) => Math.floor((Date.now() - new Date(a.date + "T00:00:00").getTime()) / 864e5);
export const words = (a: Article) => a.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
// Mêmes 7 critères que l'ancien frontend
export const checks = (a: Article): [string, boolean][] => [
  ["Title ≤ 60 chars", a.title.length > 0 && a.title.length <= 60],
  ["Meta description 120–160 chars", a.meta.length >= 120 && a.meta.length <= 160],
  ["Image alt text", !!a.alt && !!a.img],
  ["Subtitle", !!a.sub],
  ["3 tags", a.t.filter(Boolean).length === 3],
  ["Clean slug ≤ 75", /^[a-z0-9-]+$/.test(a.slug) && a.slug.length <= 75],
  ["600+ words with H2", words(a) >= 600 && /<h2/.test(a.html)],
];
export const score = (a: Article) => Math.round((checks(a).filter((c) => c[1]).length / 7) * 100);
export const scoreClass = (s: number) => (s >= 80 ? "text-positive" : s >= 55 ? "text-[#d99a1e]" : "text-negative");
export const fmtN = (x: number) => Math.round(x).toLocaleString("en");
export const fmtPct = (x: number) => (x * 100).toFixed(1) + "%";
export const slugify = (s: string) => s.split("|")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const since = (t?: string | null) => {
  if (!t) return "never";
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1e3);
  return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : s < 604800 ? Math.floor(s / 86400) + " d ago" : new Date(t).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
};

// ───────── Pourcentages & formats (Search Console) ─────────
export type Delta = { text: string; tone: "pos" | "neg" | "flat"; up: boolean | null };
/** Variation en % entre deux périodes : « New » si la période précédente était à 0, jamais de division par zéro */
export function calcDelta(cur: number, prev: number): Delta | null {
  if (!prev && !cur) return null;
  if (!prev) return { text: "New", tone: "pos", up: true };
  const v = ((cur - prev) / prev) * 100, a = Math.abs(v);
  if (a < 0.05) return { text: "0%", tone: "flat", up: null };
  if (a >= 1000) return { text: "999%+", tone: "pos", up: true };
  const t = a < 10 ? a.toFixed(1).replace(/\.0$/, "") + "%" : Math.round(a) + "%";
  return { text: (v > 0 ? "+" : "−") + t, tone: v > 0 ? "pos" : "neg", up: v > 0 };
}
/** Variation d'un taux (CTR) en points de pourcentage */
export function calcPp(cur: number, prev: number): Delta | null {
  const d = (cur - prev) * 100;
  if (!prev && !cur) return null;
  if (Math.abs(d) < 0.005) return { text: "0 pp", tone: "flat", up: null };
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(Math.abs(d) < 1 ? 2 : 1)} pp`, tone: d > 0 ? "pos" : "neg", up: d > 0 };
}
/** CTR (fraction 0–1) → texte : 0%, 0.15%, 3.9%, 12.3% */
export const fmtCtr = (x: number) => { const v = x * 100; return v === 0 ? "0%" : v < 1 ? v.toFixed(2) + "%" : v.toFixed(1) + "%"; };
export const fmtPos = (x: number) => (x > 0 ? x.toFixed(1) : "—");
/** Pourcentages entiers dont la somme fait exactement 100 (méthode du plus grand reste) */
export function shares(vals: number[]): number[] {
  const tot = vals.reduce((a, b) => a + b, 0);
  if (!tot) return vals.map(() => 0);
  const raw = vals.map((v) => (v / tot) * 100), base = raw.map(Math.floor);
  let left = 100 - base.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) base[i]++; });
  return base;
}
export const dayDiff = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 864e5);
export const relDay = (d: string) => { const n = dayDiff(d); return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : n > 0 ? `In ${n} days` : `${-n} days ago`; };
export const relDateTime = (iso: string) => {
  const at = new Date(iso), now = new Date();
  const sameDay = at.toLocaleDateString() === now.toLocaleDateString();
  if (sameDay) return "Today";
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  if (at.toLocaleDateString() === tomorrow.toLocaleDateString()) return "Tomorrow";
  const dayKey = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((dayKey(at) - dayKey(now)) / 864e5);
  return days > 0 ? `In ${days} days` : "Today";
};
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
