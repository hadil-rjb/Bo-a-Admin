import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Activity, ActivityDocument } from "./activity.schema";

export type Actor = { id: string | null; name: string };

const TRACK = ["title", "meta", "sub", "cat", "t", "html", "date", "time", "status", "slug", "img", "alt", "coverPrompt"] as const;
const norm = (f: string, v: any) => (f === "t" ? (Array.isArray(v) ? v.filter(Boolean) : []) : v ?? "");
const size = (v: unknown) => JSON.stringify(v ?? "").length;
const disp = (f: string, v: any): string => {
  if (f === "html") return `${String(v ?? "").replace(/<[^>]*>/g, "").length} chars`;
  if (f === "img") return !v ? "none" : String(v).startsWith("data:") ? "uploaded image" : String(v).slice(0, 120);
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || "none";
  return String(v ?? "").slice(0, 160) || "empty";
};

/** Différences champ par champ + valeurs précédentes (pour pouvoir restaurer) */
export function diffArticle(prev: any, next: any) {
  const changes: { f: string; from: string; to: string }[] = [];
  const before: Record<string, unknown> = {};
  let restorable = true;
  for (const f of TRACK) {
    if (JSON.stringify(norm(f, prev[f])) === JSON.stringify(norm(f, next[f]))) continue;
    changes.push({ f, from: disp(f, prev[f]), to: disp(f, next[f]) });
    if (size(prev[f]) > 400_000) restorable = false; else before[f] = prev[f] ?? (f === "t" ? [] : "");
  }
  return { changes, before, restorable };
}

export function snapshot(doc: any) {
  const { _id, __v, createdAt, updatedAt, ...rest } = doc;
  return size(rest) < 900_000 ? rest : null;
}

@Injectable()
export class ActivityService {
  private log = new Logger("Activity");
  constructor(@InjectModel(Activity.name) private m: Model<ActivityDocument>) {}

  /** Ne fait jamais échouer l'action métier */
  async record(e: Partial<Activity>) {
    try { await this.m.create(e); } catch (err) { this.log.warn(`journal indisponible : ${(err as Error).message}`); }
  }

  get(id: string) { return this.m.findById(id).select("+before"); }
  markRestored(id: string) { return this.m.updateOne({ _id: id }, { restoredAt: new Date() }); }

  async list(kind = "all", before?: string, limit = 30) {
    const q: Record<string, any> =
      kind === "open" ? { kind: "open" } : kind === "article" ? { kind: "article" } : kind === "share" ? { kind: "share" } : { kind: { $in: ["article", "share"] } };
    if (before && !isNaN(+new Date(before))) q.createdAt = { $lt: new Date(before) };
    const n = Math.min(Math.max(limit || 30, 1), 100);
    const rows: any[] = await this.m.find(q).sort({ createdAt: -1 }).limit(n + 1).lean();
    const items = rows.slice(0, n).map(({ _id, ...r }) => ({ _id: String(_id), ...r }));
    return { items, next: rows.length > n ? new Date(items[n - 1].createdAt).toISOString() : null };
  }
}
