import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel, Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { createHash } from "crypto";
import { Model } from "mongoose";
import { decrypt, encrypt } from "../../common/crypto";
import { validTz } from "../../framer/time";
import { SocialIntegration } from "../publishing/connection.schema";
import { PublisherService } from "../publishing/publisher.service";
import { SocialAutomation } from "../schemas/automation.schema";
import { SocialBrand } from "../schemas/brand.schema";
import { SocialDesign } from "../schemas/design.schema";
import { SocialPost } from "../schemas/post.schema";
import { SocialWorkspace, WORKSPACE_ID } from "../schemas/workspace.schema";
import { NotionClient, plain, text } from "./notion.client";

/** Which Notion page shows which post (kept apart from the posts: the studio's sync never touches it) */
@Schema({ collection: "social_notion_pages", timestamps: true, versionKey: false })
export class SocialNotionPage {
  @Prop({ required: true }) brandId!: string;
  @Prop({ required: true }) postId!: string;
  @Prop({ required: true }) pageId!: string;
  @Prop() date?: string;
  @Prop() hash?: string;
  /** The pictures it shows in its body ("v2|" once the page has no cover), and the image blocks this sync added to the page */
  @Prop() imgHash?: string;
  @Prop({ type: [String], default: [] }) blocks?: string[];
}
export const SocialNotionPageSchema = SchemaFactory.createForClass(SocialNotionPage);
SocialNotionPageSchema.index({ brandId: 1, postId: 1 }, { unique: true });

const ID = "notion";
const NETS: Record<string, [string, string]> = { ig: ["Instagram", "pink"], li: ["LinkedIn", "blue"], x: ["X", "gray"], fb: ["Facebook", "blue"], tt: ["TikTok", "default"], tg: ["Telegram", "blue"] };
const STATUSES: [string, string][] = [["Scheduled", "blue"], ["Ready", "yellow"], ["Published", "green"], ["Failed", "red"]];
/** The properties the calendar database needs (a title and a date are found or added separately) */
const PROPS: Record<string, any> = {
  Status: { select: { options: STATUSES.map(([name, color]) => ({ name, color })) } },
  Networks: { multi_select: { options: Object.values(NETS).map(([name, color]) => ({ name, color })) } },
  Automation: { select: {} },
  Brand: { select: {} },
  Caption: { rich_text: {} },
  Link: { url: {} },
};
/** Keep this many days of past posts in sync (status, links); older pages are left as they are */
const PAST_DAYS = 14;
const ext = (url: string) => ({ type: "external", external: { url } });
const imageBlock = (url: string) => ({ object: "block", type: "image", image: ext(url) });
const opt = (s: string) => s.replace(/,/g, " ").trim().slice(0, 100) || "—";

/**
 * Notion Calendar: the schedule as a Notion database (one page per post, with its date and time), which
 * Notion Calendar shows like any calendar. Uses an internal integration token (Settings → Notion
 * Calendar). Automation runs are synced (and, if chosen, every scheduled post): created, updated when
 * their time, status or caption change, archived when they're skipped or removed.
 */
@Injectable()
export class NotionService {
  private log = new Logger("Notion");
  private running = false;
  private again = false;
  private soon?: NodeJS.Timeout;

  constructor(
    @InjectModel(SocialIntegration.name) private integ: Model<SocialIntegration>,
    @InjectModel(SocialNotionPage.name) private links: Model<SocialNotionPage>,
    @InjectModel(SocialPost.name) private posts: Model<SocialPost>,
    @InjectModel(SocialAutomation.name) private autos: Model<SocialAutomation>,
    @InjectModel(SocialBrand.name) private brands: Model<SocialBrand>,
    @InjectModel(SocialDesign.name) private designs: Model<SocialDesign>,
    @InjectModel(SocialWorkspace.name) private workspaces: Model<SocialWorkspace>,
    private cfg: ConfigService,
    private publisher: PublisherService,
  ) {}

  private get secret() { return this.cfg.getOrThrow<string>("JWT_SECRET"); }
  private get base() { return (this.cfg.get<string>("NOTION_API_URL") || "https://api.notion.com/v1").replace(/\/+$/, ""); }
  private get front() { return (this.cfg.get<string>("FRONTEND_URL") || "http://localhost:3000").replace(/\/+$/, ""); }
  private async doc() { return this.integ.findById(ID).lean<{ secret?: string; info?: Record<string, any> }>(); }
  private client(doc: { secret?: string } | null) {
    if (!doc?.secret) throw new BadRequestException("Connect Notion first: Settings → Notion Calendar");
    return new NotionClient(decrypt(doc.secret, this.secret), this.base);
  }
  private async setInfo(patch: Record<string, any>) {
    const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`info.${k}`, v]));
    await this.integ.updateOne({ _id: ID }, { $set: set });
  }

  /** Connected, with a calendar database chosen */
  async ready() { const d = await this.doc(); return !!(d?.secret && d.info?.database?.id); }

  /* ---------- connection ---------- */
  async status() {
    const d = await this.doc(), i = d?.info || {};
    return {
      connected: !!d?.secret, workspace: i.workspace || "", bot: i.bot || "", connectedAt: i.connectedAt || null,
      database: i.database ? { id: i.database.id, title: i.database.title, url: i.database.url } : null,
      scope: i.scope === "all" ? "all" : "auto", lastSync: i.lastSync || null, synced: i.synced ?? 0, error: i.error || "",
    };
  }

  async connect(token: string) {
    const t = String(token || "").trim();
    if (!/^(secret_|ntn_)[A-Za-z0-9]{20,}$/.test(t)) throw new BadRequestException("That doesn't look like a Notion integration secret (it starts with ntn_ or secret_)");
    const me: any = await new NotionClient(t, this.base).call("GET", "/users/me");
    const info = { workspace: me?.bot?.workspace_name || "", bot: me?.name || "Integration", connectedAt: new Date(), scope: "auto", database: null, error: "" };
    await this.integ.updateOne({ _id: ID }, { $set: { secret: encrypt(t, this.secret), info } }, { upsert: true });
    await this.links.deleteMany({});
    return this.status();
  }

  async disconnect() {
    await this.integ.deleteOne({ _id: ID });
    await this.links.deleteMany({});
    return { ok: true };
  }

  /** Pages and databases shared with the integration */
  async targets(q?: string) {
    const c = this.client(await this.doc());
    const r: any = await c.call("POST", "/search", { query: String(q || "").slice(0, 100), page_size: 40, sort: { direction: "descending", timestamp: "last_edited_time" } });
    return (r.results || []).filter((x: any) => !x.archived).map((x: any) => {
      const tp: any = Object.values(x.properties || {}).find((p: any) => p?.type === "title"), title = x.object === "database" ? plain(x.title) : plain(tp?.title);
      return { id: x.id, type: x.object, title: title || "Untitled", icon: x.icon?.type === "emoji" ? x.icon.emoji : "", url: x.url };
    });
  }

  /** Uses a database (adds the properties it lacks) or creates "Social calendar" inside a page */
  async setup(o: { databaseId?: string; pageId?: string; title?: string }) {
    const d = await this.doc(), c = this.client(d);
    let db: any;
    if (o.pageId) {
      db = await c.call("POST", "/databases", {
        parent: { type: "page_id", page_id: o.pageId }, icon: { type: "emoji", emoji: "📅" },
        title: text(String(o.title || "Social calendar").slice(0, 100)),
        properties: { Name: { title: {} }, When: { date: {} }, ...PROPS },
      });
    } else if (o.databaseId) {
      db = await c.call("GET", `/databases/${o.databaseId}`);
      const have = db.properties || {}, missing: Record<string, any> = {};
      // a column with our name but another type: say so before changing anything
      for (const k of Object.keys(PROPS)) if (have[k] && Object.keys(PROPS[k])[0] !== have[k].type) throw new BadRequestException(`The database already has a “${k}” property of another type: rename it, or let us create a new database`);
      for (const [k, v] of Object.entries(PROPS)) if (!have[k]) missing[k] = v;
      if (!Object.values(have).some((p: any) => p?.type === "date")) missing.When = { date: {} };
      if (Object.keys(missing).length) db = await c.call("PATCH", `/databases/${o.databaseId}`, { properties: missing });
    } else throw new BadRequestException("Choose a database, or a page to create one in");
    const props = db.properties || {};
    const titleProp = Object.keys(props).find((k) => props[k].type === "title")!;
    const dateProp = props.When?.type === "date" ? "When" : Object.keys(props).find((k) => props[k].type === "date")!;
    await this.links.deleteMany({}); // the pages of another database aren't this one's
    await this.setInfo({ database: { id: db.id, title: plain(db.title) || "Social calendar", url: db.url, titleProp, dateProp }, error: "", synced: 0 });
    this.reconcileSoon(100);
    return this.status();
  }

  async options(o: { scope?: "auto" | "all" }) {
    if (o.scope) await this.setInfo({ scope: o.scope === "all" ? "all" : "auto" });
    this.reconcileSoon(100);
    return this.status();
  }

  /* ---------- sync ---------- */
  /** Syncs a few seconds from now (changes come in bursts: an automation edit re-plans several runs) */
  reconcileSoon(ms = 3000) {
    if (this.soon) clearTimeout(this.soon);
    this.soon = setTimeout(() => void this.reconcile().catch((e) => this.log.warn(e?.message || e)), ms);
  }

  async syncNow() { await this.reconcile(); return this.status(); }

  private async reconcile() {
    const d = await this.doc(), db = d?.info?.database;
    if (!d?.secret || !db?.id) return;
    if (this.running) { this.again = true; return; }
    this.running = true;
    try {
      const c = this.client(d), scope = d.info?.scope === "all" ? "all" : "auto";
      const from = new Date(Date.now() - PAST_DAYS * 864e5).toISOString().slice(0, 10);
      const autos = new Map((await this.autos.find({}).select("brandId id name notion preview").lean<Record<string, any>[]>()).map((a) => [`${a.brandId}|${a.id}`, a]));
      const ws = await this.workspaces.findById(WORKSPACE_ID).lean(), wsTz = String(((ws?.set || {}) as any).tz || "");
      const all = await this.posts.find({ date: { $gte: from }, status: { $in: ["Scheduled", "Published", "Failed"] } }).lean<Record<string, any>[]>();
      const want = all.filter((p) => {
        if (p.auto) { const a = autos.get(`${p.brandId}|${p.auto.id}`); return !!a && a.notion !== false; }
        return scope === "all";
      });
      const links = new Map((await this.links.find({}).lean<Record<string, any>[]>()).map((l) => [`${l.brandId}|${l.postId}`, l]));
      const brandName = new Map<string, string>(), designName = new Map<string, string>();
      const nameOf = async (brandId: string) => { if (!brandName.has(brandId)) brandName.set(brandId, (await this.brands.findById(brandId).select("name").lean<any>())?.name || brandId); return brandName.get(brandId)!; };
      const designOf = async (brandId: string, id: string) => { const k = `${brandId}|${id}`; if (!designName.has(k)) designName.set(k, (await this.designs.findOne({ brandId, id }).select("name").lean<any>())?.name || "Post"); return designName.get(k)!; };
      const seen = new Set<string>();
      let made = 0, changed = 0, archived = 0;
      for (const p of want) {
        const k = `${p.brandId}|${p.id}`; seen.add(k);
        const props = this.props(p, db, await nameOf(p.brandId), p.auto?.name || (await designOf(p.brandId, p.d)), validTz(p.tz || "") ? p.tz : validTz(wsTz) ? wsTz : "UTC");
        const hash = createHash("sha1").update(JSON.stringify(props)).digest("hex"), link = links.get(k);
        // the design: the post's own slides once it has them, the automation's preview before
        // pages carry no cover: the pictures only go in the body ("v2|" makes pages synced with a cover drop it once)
        const imgs = this.images(p, p.auto ? autos.get(`${p.brandId}|${p.auto.id}`) : null), imgHash = "v2|" + imgs.join("|");
        if (!link) {
          const page: any = await c.call("POST", "/pages", { parent: { database_id: db.id }, icon: { type: "emoji", emoji: p.auto ? "🔁" : "📣" }, properties: props, children: imgs.map(imageBlock) });
          const blocks = imgs.length ? ((await c.call("GET", `/blocks/${page.id}/children?page_size=50`)).results || []).filter((b: any) => b.type === "image").map((b: any) => b.id) : [];
          await this.links.updateOne({ brandId: p.brandId, postId: p.id }, { $set: { pageId: page.id, date: p.date, hash, imgHash, blocks } }, { upsert: true }); made++;
        } else if (link.hash !== hash || (link.imgHash || "") !== imgHash) {
          const imgChanged = (link.imgHash || "") !== imgHash;
          await c.call("PATCH", `/pages/${link.pageId}`, { properties: props, archived: false, ...(imgChanged ? { cover: null } : {}) });
          let blocks: string[] = link.blocks || [];
          if (imgChanged) {
            // only the image blocks this sync added are replaced: notes written in the page stay
            for (const b of blocks) await c.call("DELETE", `/blocks/${b}`).catch(() => undefined);
            blocks = imgs.length ? ((await c.call("PATCH", `/blocks/${link.pageId}/children`, { children: imgs.map(imageBlock) })).results || []).map((b: any) => b.id) : [];
          }
          await this.links.updateOne({ _id: link._id }, { $set: { hash, date: p.date, imgHash, blocks } }); changed++;
        }
      }
      // posts that were skipped, re-planned, deleted or left the sync: their pages are archived
      for (const [k, l] of links) {
        if (seen.has(k) || (l.date && l.date < from)) continue;
        try { await c.call("PATCH", `/pages/${l.pageId}`, { archived: true }); } catch (e: any) { if (!/can't see it/.test(e?.message || "")) throw e; }
        await this.links.deleteOne({ _id: l._id }); archived++;
      }
      await this.setInfo({ lastSync: new Date(), synced: want.length, error: "" });
      if (made || changed || archived) this.log.log(`Notion Calendar: ${made} added, ${changed} updated, ${archived} archived`);
    } catch (e: any) {
      await this.setInfo({ error: String(e?.message || e).slice(0, 300), lastSync: new Date() });
      throw e;
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.reconcileSoon(500); }
    }
  }

  /** Public links of the pictures a post's page shows (at most 4) */
  private images(p: Record<string, any>, a: Record<string, any> | null | undefined) {
    const ids: string[] = p.media?.ids?.length ? p.media.ids : a?.preview?.ids || [];
    return ids.slice(0, 4).map((id) => this.publisher.publicUrl(id));
  }

  /** A post as Notion properties: name, date with its time zone (30 min), status, networks, automation, brand, caption, link */
  private props(p: Record<string, any>, db: Record<string, any>, brand: string, name: string, tz: string) {
    const [h, m] = String(p.time || "09:00").split(":").map(Number), endMin = h * 60 + m + 30;
    const endDate = endMin >= 1440 ? new Date(Date.parse(p.date + "T12:00:00Z") + 864e5).toISOString().slice(0, 10) : p.date;
    const two = (n: number) => String(n).padStart(2, "0"), em = endMin % 1440;
    const results = p.publish?.results || {}, url = (Object.values(results).find((r: any) => r?.url) as any)?.url || `${this.front}/social-media#/planner`;
    const status = p.status === "Published" ? "Published" : p.status === "Failed" || p.publish?.state === "failed" ? "Failed" : p.publish?.state === "pending" ? "Ready" : "Scheduled";
    return {
      [db.titleProp]: { title: text(name) },
      [db.dateProp]: { date: { start: `${p.date}T${two(h)}:${two(m)}:00`, end: `${endDate}T${two(Math.floor(em / 60))}:${two(em % 60)}:00`, time_zone: tz } },
      Status: { select: { name: status } },
      Networks: { multi_select: (p.pf || []).filter((k: string) => NETS[k]).map((k: string) => ({ name: NETS[k][0] })) },
      Automation: { select: p.auto?.name ? { name: opt(p.auto.name) } : null },
      Brand: { select: { name: opt(brand) } },
      Caption: { rich_text: text(String(p.cap || "")) },
      Link: { url },
    };
  }
}
