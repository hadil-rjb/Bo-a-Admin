import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomBytes } from "crypto";
import { Model } from "mongoose";
import { AiService } from "../../ai/ai.service";
import { validTz, zonedToUtc } from "../../framer/time";
import { SocialMedia } from "../publishing/connection.schema";
import { LiveRenderService } from "../publishing/live-render.service";
import { REVIEW_GRACE_MS } from "../publishing/post-state";
import { PublisherService } from "../publishing/publisher.service";
import { SocialAutomation } from "../schemas/automation.schema";
import { SocialBrand } from "../schemas/brand.schema";
import { SocialDesign } from "../schemas/design.schema";
import { SocialPost } from "../schemas/post.schema";
import { SocialWorkspace, WORKSPACE_ID } from "../schemas/workspace.schema";
import { NotionService } from "../notion/notion.service";
import { strip } from "../social.util";
import { fillCaption, localDate, occurrences } from "./schedule";

/**
 * What a design looks like, without its live data: layout, colours, fonts and fixed texts. Texts of live
 * pages change with every refresh, so they don't count (a new preview is rendered when the design changes).
 */
function designHash(d: Record<string, any>) {
  const pages = (d.pages || []).map((pg: any) => (pg.layers || []).filter((l: any) => !l.lvw).map((l: any) => [l.id, l.type, l.x, l.y, l.w, l.h, l.fill, l.color, l.font, l.size, l.weight, l.hidden, pg.live ? "" : l.text]));
  return createHash("sha1").update(JSON.stringify([d.ratio, pages])).digest("hex");
}

/** Runs are created this far ahead, so they show in the planner */
const HORIZON_MS = 7 * 864e5;
/** A run is rendered with fresh data and armed this long before its time */
const ARM_MS = 10 * 60_000;
/** A run the server couldn't arm in time (it was offline) is reported as missed after this */
const MISSED_MS = 60 * 60_000;
const ARM_TRIES = 3;
const DONE = ["publishing", "published", "partial"];

export type AutomationInput = {
  name?: string; d?: string; active?: boolean; notion?: boolean; approval?: boolean; tz?: string; pf?: string[];
  cadence?: { kind: "daily" | "weekdays" | "weekly"; days: number[]; time: string };
  caption?: { mode: "fixed" | "ai"; text: string; fc?: string };
  startDate?: string | null; endDate?: string | null;
};

/**
 * Recurring posts. Each run becomes a scheduled post (id au_<automation>_<YYYYMMDD>) created a week
 * ahead, so it shows in the planner and can be skipped there. About ten minutes before its time the
 * server renders it with fresh live data (LiveRenderService), writes the caption and arms it; the
 * publish scheduler then publishes it like any other post.
 *
 * With `approval`, each run is created "In Review" and shown in Notion with that status; it's armed only
 * once the team sets it to Approved there (NotionService reads the decisions back), and never if Rejected.
 */
@Injectable()
export class AutomationsService {
  private log = new Logger("Automations");
  private lastSync = 0;

  constructor(
    @InjectModel(SocialAutomation.name) private autos: Model<SocialAutomation>,
    @InjectModel(SocialPost.name) private posts: Model<SocialPost>,
    @InjectModel(SocialDesign.name) private designs: Model<SocialDesign>,
    @InjectModel(SocialBrand.name) private brands: Model<SocialBrand>,
    @InjectModel(SocialMedia.name) private media: Model<SocialMedia>,
    @InjectModel(SocialWorkspace.name) private workspaces: Model<SocialWorkspace>,
    private render: LiveRenderService,
    private publisher: PublisherService,
    private ai: AiService,
    private notion: NotionService,
  ) {}

  /* ---------- CRUD ---------- */
  private async tzDefault() {
    const ws = await this.workspaces.findById(WORKSPACE_ID).lean();
    const tz = String(((ws?.set || {}) as any).tz || "");
    return validTz(tz) ? tz : "UTC";
  }

  /** The brand's automations, each with its next runs and the result of its last one */
  async list(brandId: string) {
    const list = await this.autos.find({ brandId }).sort({ createdAt: 1 }).lean<Record<string, any>[]>();
    const now = Date.now(), ids = list.map((a) => a.id);
    const runs = await this.posts.find({ brandId, "auto.id": { $in: ids } }).select("id date time tz status publish auto media.count").lean<Record<string, any>[]>();
    return {
      server: { render: !this.render.disabledByEnv },
      automations: list.map((a): Record<string, any> => {
        const mine: Record<string, any>[] = runs.filter((p) => p.auto?.id === a.id).map((p) => ({ ...p, at: zonedToUtc(p.date, p.time, p.tz || a.tz).getTime() }));
        const past = mine.filter((p) => p.at <= now || DONE.includes(p.publish?.state) || p.status === "Failed").sort((x, y) => y.at - x.at)[0];
        const results = past?.publish?.results || {};
        return {
          ...(strip(a) as Record<string, any>),
          next: a.active ? occurrences(a as any, now, now + 60 * 864e5, 3).map((o) => ({ date: o.date, time: o.time, at: o.at.toISOString() })) : [],
          last: past ? {
            date: past.date, time: past.time, postId: past.id, status: past.status, state: past.publish?.state || (past.media?.count ? "pending" : "idle"),
            error: past.publish?.lastError || past.autoError || Object.values(results).map((r: any) => r?.error).filter(Boolean)[0] || "",
            urls: Object.fromEntries(Object.entries(results).filter(([, r]: any) => r?.url).map(([k, r]: any) => [k, r.url])),
          } : null,
          published: mine.filter((p) => p.status === "Published").length,
          inReview: mine.filter((p) => p.status === "In Review" && p.at > now).length,
        };
      }),
    };
  }

  async create(brandId: string, input: AutomationInput, by?: string) {
    if (!(await this.brands.exists({ _id: brandId }))) throw new NotFoundException("Brand not found");
    const a = this.check({ active: true, caption: { mode: "fixed", text: "" }, pf: [], ...input }, true);
    if (!(await this.designs.exists({ brandId, id: a.d }))) throw new BadRequestException("Choose a design for this automation");
    const doc = await this.autos.create({ ...a, notion: a.notion ?? true, approval: a.approval ?? false, tz: a.tz || (await this.tzDefault()), skip: [], brandId, id: "a" + randomBytes(5).toString("hex"), createdBy: by });
    await this.sync(doc.toObject());
    return (await this.list(brandId)).automations.find((x) => x.id === doc.id);
  }

  async update(brandId: string, id: string, input: AutomationInput) {
    const cur = await this.autos.findOne({ brandId, id }).lean<Record<string, any>>();
    if (!cur) throw new NotFoundException("Automation not found");
    const a = this.check({ ...input }, false);
    if (a.d && !(await this.designs.exists({ brandId, id: a.d }))) throw new BadRequestException("That design doesn't exist");
    await this.autos.updateOne({ brandId, id }, { $set: { ...a, ...(a.active ? { note: "" } : {}) } });
    await this.sync({ ...cur, ...a });
    return (await this.list(brandId)).automations.find((x) => x.id === id);
  }

  async remove(brandId: string, id: string) {
    const cur = await this.autos.findOne({ brandId, id }).lean<Record<string, any>>();
    if (!cur) throw new NotFoundException("Automation not found");
    await this.dropFuture(brandId, id, new Set());
    await this.autos.deleteOne({ brandId, id });
    await this.media.deleteMany({ brandId, postId: `preview_${id}` });
    this.notion.reconcileSoon();
    return { ok: true };
  }

  /** Skips one run (from the planner); the date is remembered so the run isn't created again */
  async skip(brandId: string, id: string, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new BadRequestException("Give the date to skip");
    const cur = await this.autos.findOneAndUpdate({ brandId, id }, { $addToSet: { skip: date } }, { new: true }).lean<Record<string, any>>();
    if (!cur) throw new NotFoundException("Automation not found");
    await this.sync(cur);
    return { ok: true };
  }

  /** One run right now: rendered, armed and published by the scheduler within a minute */
  async runNow(brandId: string, id: string) {
    const a = await this.autos.findOne({ brandId, id }).lean<Record<string, any>>();
    if (!a) throw new NotFoundException("Automation not found");
    if (!a.pf?.length) throw new BadRequestException("Choose at least one network first");
    const now = Date.now(), date = localDate(now, a.tz);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: a.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now));
    const postId = `au_${a.id}_now${now.toString(36)}`;
    await this.posts.create({ ...this.postFor(a, date, time), id: postId });
    // with approval it goes to Notion first, and out as soon as it's approved there
    if (a.approval) { this.notion.reconcileSoon(500); return { postId, date, time, review: true }; }
    await this.armOne(a, { brandId, id: postId, date, time, tz: a.tz });
    return { postId, date, time };
  }

  private check(a: AutomationInput & Record<string, any>, full: boolean) {
    const out: Record<string, any> = {};
    if (a.name != null) out.name = String(a.name).trim().slice(0, 80) || "Automation";
    if (a.d != null) out.d = String(a.d);
    if (a.active != null) out.active = !!a.active;
    if (a.notion != null) out.notion = !!a.notion;
    if (a.approval != null) out.approval = !!a.approval;
    if (a.tz != null) { if (!validTz(a.tz)) throw new BadRequestException("Unknown time zone"); out.tz = a.tz; }
    if (a.pf != null) out.pf = [...new Set(a.pf)];
    if (a.cadence != null) {
      const c = a.cadence, days = [...new Set((c.days || []).map(Number).filter((n) => n >= 1 && n <= 7))].sort();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time || "")) throw new BadRequestException("Give a time like 08:00");
      if (c.kind === "weekly" && !days.length) throw new BadRequestException("Pick at least one day of the week");
      out.cadence = { kind: c.kind, days: c.kind === "weekly" ? days : c.kind === "weekdays" ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7], time: c.time };
    }
    if (a.caption != null) out.caption = { mode: a.caption.mode === "ai" ? "ai" : "fixed", text: String(a.caption.text || "").slice(0, 3000), fc: String(a.caption.fc || "").slice(0, 1000) };
    for (const k of ["startDate", "endDate"] as const) if (a[k] !== undefined) out[k] = a[k] || null;
    if (full && (!out.name || !out.d || !out.cadence)) throw new BadRequestException("Name, design and schedule are required");
    return out as Required<AutomationInput> & Record<string, any>;
  }

  /* ---------- runs ---------- */
  private postId(a: Record<string, any>, date: string) { return `au_${a.id}_${date.replace(/-/g, "")}`; }
  private postFor(a: Record<string, any>, date: string, time: string) {
    return {
      brandId: a.brandId, d: a.d, date, time, tz: a.tz, pf: a.pf || [], status: a.approval ? "In Review" : "Scheduled", order: Number.MAX_SAFE_INTEGER, hash: "",
      cap: fillCaption(a.caption?.text || "", { date, tz: a.tz }), fc: a.caption?.fc || "", auto: { id: a.id, name: a.name },
      ...(a.approval ? { review: { state: "pending" } } : {}),
    };
  }

  /** Creates the runs of the coming week and drops the ones the schedule no longer has (not yet published) */
  async sync(a: Record<string, any>) {
    const now = Date.now();
    const want = a.active ? occurrences(a as any, now, now + HORIZON_MS, 20) : [];
    const keep = new Set(want.map((o) => this.postId(a, o.date)));
    for (const o of want) {
      const id = this.postId(a, o.date), cur = await this.posts.findOne({ brandId: a.brandId, id }).select("publish status review").lean<Record<string, any>>();
      const rec: Record<string, any> = this.postFor(a, o.date, o.time);
      if (!cur) { await this.posts.create({ ...rec, id }); continue; }
      // not armed yet: follows the automation's latest settings. A decision taken in Notion stays (a rejected
      // run stays rejected, an approved one scheduled); turning approval off schedules the runs still in review
      if (["Scheduled", "In Review"].includes(cur.status!) && !["pending", ...DONE].includes(cur.publish?.state)) {
        const { order, review, ...upd } = rec;
        if (a.approval && cur.review?.state === "approved") await this.posts.updateOne({ brandId: a.brandId, id }, { $set: { ...upd, status: "Scheduled" } });
        else if (a.approval) await this.posts.updateOne({ brandId: a.brandId, id }, { $set: { ...upd, review: cur.review?.state === "pending" ? cur.review : review } });
        else await this.posts.updateOne({ brandId: a.brandId, id }, { $set: upd, $unset: { review: 1 } });
      }
    }
    await this.dropFuture(a.brandId, a.id, keep);
    this.notion.reconcileSoon(); // Notion Calendar follows
    if (a.active && a.notion !== false) void this.refreshPreview(a).catch((e) => this.log.warn(`Preview of ${a.id}: ${e?.message || e}`));
  }

  /**
   * The design as a picture, for Notion Calendar (each run's page shows it until the run has its own
   * slides). Rendered once, and again when the design changes; only while Notion is connected.
   */
  private previewing = new Set<string>();
  private async refreshPreview(a: Record<string, any>) {
    if (this.previewing.has(a.id) || !(await this.notion.ready())) return;
    const design = await this.designs.findOne({ brandId: a.brandId, id: a.d }).select("ratio pages").lean<Record<string, any>>();
    if (!design) return;
    const hash = designHash(design);
    if (a.preview?.d === a.d && a.preview?.hash === hash) return;
    const run = await this.posts.findOne({ brandId: a.brandId, "auto.id": a.id, status: { $in: ["Scheduled", "In Review"] } }).sort({ date: 1, time: 1 }).select("id").lean<Record<string, any>>();
    if (!run) return;
    this.previewing.add(a.id);
    try {
      const r = await this.render.renderPost(a.brandId, run.id);
      if (!r?.images.length) return;
      const ids = await this.publisher.storeImages(a.brandId, `preview_${a.id}`, r.images.slice(0, 4));
      await this.autos.updateOne({ brandId: a.brandId, id: a.id }, { $set: { preview: { ids, at: new Date(), d: a.d, hash } } });
      this.notion.reconcileSoon();
    } finally { this.previewing.delete(a.id); }
  }

  private async dropFuture(brandId: string, autoId: string, keep: Set<string>) {
    const today = localDate(Date.now() - 864e5, "UTC");
    const old = await this.posts.find({ brandId, "auto.id": autoId, date: { $gte: today } }).select("id date time tz status publish").lean<Record<string, any>[]>();
    const gone = old.filter((p) => !keep.has(p.id) && !String(p.id).includes("_now") && p.status !== "Published" && !DONE.includes(p.publish?.state) && zonedToUtc(p.date, p.time, p.tz || "UTC").getTime() > Date.now());
    if (!gone.length) return;
    await this.posts.deleteMany({ brandId, id: { $in: gone.map((p) => p.id) } });
    await this.media.deleteMany({ brandId, postId: { $in: gone.map((p) => p.id) } });
  }

  /** Called by the publish scheduler every 30 s: keeps the week of runs up to date, then arms the runs that are due soon */
  async tick() {
    const now = Date.now();
    if (now - this.lastSync > 5 * 60_000) {
      this.lastSync = now;
      for (const a of await this.autos.find({}).lean<Record<string, any>[]>()) {
        try {
          if (!(await this.brands.exists({ _id: a.brandId }))) { await this.autos.deleteOne({ _id: a._id }); continue; }
          if (a.active && !(await this.designs.exists({ brandId: a.brandId, id: a.d }))) {
            await this.autos.updateOne({ _id: a._id }, { $set: { active: false, note: "Paused: its design was deleted." } }); a.active = false;
          }
          await this.sync(a);
        } catch (e: any) { this.log.warn(`Automation ${a.id}: ${e?.message || e}`); }
      }
    }
    const lo = localDate(now - 2 * 864e5, "UTC"), hi = localDate(now + 2 * 864e5, "UTC");
    const runs = await this.posts.find({ "auto.id": { $exists: true }, status: "Scheduled", date: { $gte: lo, $lte: hi }, "publish.state": { $nin: ["pending", ...DONE] } })
      .select("brandId id date time tz auto autoTries review").lean<Record<string, any>[]>();
    for (const p of runs) {
      const at = zonedToUtc(p.date, p.time, p.tz || "UTC").getTime();
      if (at - now > ARM_MS) continue;
      // approved after its time (within REVIEW_GRACE_MS): it goes out now, so "missed" counts from the approval
      const since = Math.max(at, p.review?.at ? new Date(p.review.at).getTime() : 0);
      if (now - since > MISSED_MS) { await this.fail(p, "Missed: the server couldn't prepare it in time."); continue; }
      const a = await this.autos.findOne({ brandId: p.brandId, id: p.auto.id }).lean<Record<string, any>>();
      if (!a) { await this.fail(p, "Its automation was deleted."); continue; }
      await this.armOne(a, p);
    }
    // runs nobody approved or rejected in time are not published
    const waiting = await this.posts.find({ "auto.id": { $exists: true }, status: "In Review", date: { $lte: hi } }).select("brandId id date time tz").lean<Record<string, any>[]>();
    for (const p of waiting) {
      if (now - zonedToUtc(p.date, p.time, p.tz || "UTC").getTime() > REVIEW_GRACE_MS) await this.fail(p, "Not approved in Notion in time, so it wasn't published.", { status: "In Review" });
    }
  }

  private async fail(p: Record<string, any>, error: string, only: Record<string, any> = {}) {
    await this.posts.updateOne({ brandId: p.brandId, id: p.id, ...only }, { $set: { status: "Failed", autoError: error, publish: { state: "failed", results: {}, attempts: 0, lastError: error, at: new Date() } } });
    this.log.warn(`Run ${p.id} (${p.brandId}): ${error}`);
    this.notion.reconcileSoon();
  }

  /** Renders a run with fresh data, writes its caption and hands it to the publisher */
  private async armOne(a: Record<string, any>, p: Record<string, any>) {
    try {
      if (!a.pf?.length) throw new Error("No network selected");
      const r = await this.render.renderPost(p.brandId, p.id);
      if (!r) throw new Error("Rendering is switched off on this server (SOCIAL_LIVE_RENDER)");
      const caption = await this.caption(a, p, r);
      await this.publisher.arm(p.brandId, p.id, r.images, { by: "automation", at: new Date(), pages: r.live }, caption);
      this.log.log(`Armed run ${p.id} (${p.brandId}) of “${a.name}” for ${p.date} ${p.time}`);
      this.notion.reconcileSoon();
    } catch (e: any) {
      const tries = (p.autoTries || 0) + 1, msg = String(e?.message || e).slice(0, 300);
      if (tries >= ARM_TRIES) await this.fail(p, `Couldn't prepare the post: ${msg}`);
      else await this.posts.updateOne({ brandId: p.brandId, id: p.id }, { $set: { autoTries: tries, autoError: msg } });
      this.log.warn(`Run ${p.id} (${p.brandId}), try ${tries}: ${msg}`);
    }
  }

  /** The automation's caption with today's data, or a fresh one written by AI in the brand's voice */
  private async caption(a: Record<string, any>, p: Record<string, any>, r: { live: any[]; texts: string[] }) {
    const brand = await this.brands.findById(p.brandId).lean<Record<string, any>>();
    const shownOf = (kind: string) => r.live.filter((x) => x.kind === kind && x.shown?.length).map((x) => x.shown[0])[0] || "";
    const lang = /arab|عرب/i.test(brand?.lang || "") ? "ar" : "en";
    const fixed = fillCaption(a.caption?.text || "", { date: p.date, tz: a.tz, lang, headline: shownOf("news"), price: shownOf("price"), brand: brand?.name, website: brand?.website, hashtags: brand?.hashtags });
    if (a.caption?.mode !== "ai") return fixed;
    try {
      const design = await this.designs.findOne({ brandId: p.brandId, id: a.d }).select("name").lean<Record<string, any>>();
      const out = await this.ai.socialCaption({
        brand: brand?.name || "Brand", voice: brand?.voice || "", dos: brand?.dos || "", donts: brand?.donts || "", hashtags: brand?.hashtags || "", cta: brand?.cta || "",
        language: brand?.lang || "", design: String(design?.name || a.name).slice(0, 120), texts: r.texts.slice(0, 80), networks: a.pf,
      } as any, { id: "automation", name: "Automation" });
      return out.caption || fixed;
    } catch (e: any) {
      this.log.warn(`AI caption for ${p.id} failed, using the automation's caption: ${e?.message || e}`);
      return fixed;
    }
  }
}
