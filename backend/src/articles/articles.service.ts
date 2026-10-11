import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import { Article, ArticleDocument } from "./article.schema";
import { CreateArticleDto, ListArticlesQuery, UpdateArticleDto } from "./dto/article.dto";
import { Actor, ActivityService, diffArticle, snapshot } from "../share/activity.service";
import { FramerSettings, FramerSettingsDocument } from "../framer/framer-settings.schema";
import { zonedToUtc } from "../framer/time";

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

/** Mêmes contrôles SEO que le front */
export const seoChecks = (a: Pick<Article, "title" | "meta" | "alt">) => ({
  title: a.title.length > 0 && a.title.length <= 60,
  meta: a.meta.length >= 120 && a.meta.length <= 160,
  alt: a.alt.trim().length > 0,
});

@Injectable()
export class ArticlesService {
  constructor(
    @InjectModel(Article.name) private model: Model<ArticleDocument>,
    @InjectModel(FramerSettings.name) private framerSettings: Model<FramerSettingsDocument>,
    private act: ActivityService,
  ) {}

  list({ q, status, cat, full }: ListArticlesQuery) {
    const f: FilterQuery<ArticleDocument> = {};
    if (status) f.status = status;
    if (cat) f.cat = cat;
    if (q) f.$or = ["title", "cat", "t", "slug"].map(k => ({ [k]: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }));
    const query = this.model.find(f).sort({ date: -1 });
    return (full === "1" ? query : query.select("-html")).lean();
  }

  async get(slug: string) {
    const a = await this.model.findOne({ slug }).lean();
    if (!a) throw new NotFoundException("Article introuvable");
    return a;
  }

  /** Articles réellement planifiés dans le futur, avec leur instant de publication UTC. */
  async upcoming() {
    const settings = await this.framerSettings.findOne().lean();
    const timezone = settings?.timezone || process.env.PUBLISH_TIMEZONE || "Africa/Tunis";
    const now = Date.now();
    const rows = await this.model.find({ status: "Scheduled", date: { $ne: "" } }).select("-html").lean();
    return rows
      .map((a) => ({ ...a, scheduledAt: zonedToUtc(a.date, a.time || "09:00", timezone).toISOString() }))
      .filter((a) => Number.isFinite(Date.parse(a.scheduledAt)) && Date.parse(a.scheduledAt) > now)
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  }

  async create(dto: CreateArticleDto, actor?: Actor) {
    const slug = dto.slug ?? slugify(dto.title);
    try {
      const a = await this.model.create({ ...dto, slug });
      await this.act.record({ kind: "article", action: "create", actorId: actor?.id ?? undefined, actorName: actor?.name ?? "System", target: a.title, slug: a.slug });
      return a;
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException(`Le slug « ${slug} » existe déjà`);
      throw e;
    }
  }

  async update(slug: string, dto: UpdateArticleDto, actor?: Actor) {
    try {
      const prev = await this.model.findOne({ slug }).lean();
      if (!prev) throw new NotFoundException("Article introuvable");
      // changer date / heure / statut relance le cycle de publication Framer (compteur d'essais remis à zéro)
      const reset = ("date" in dto || "time" in dto || "status" in dto) && dto.status !== "Live" ? { framerTries: 0, framerNote: "", framerState: "" } : {};
      const a = await this.model.findOneAndUpdate({ slug }, { $set: { ...dto, ...reset }, ...(reset.framerTries === 0 ? { $unset: { framerNextTry: 1, framerLock: 1 } } : {}) }, { new: true }).lean();
      if (!a) throw new NotFoundException("Article introuvable");
      const d = diffArticle(prev, a);
      if (d.changes.length)
        await this.act.record({ kind: "article", action: "update", actorId: actor?.id ?? undefined, actorName: actor?.name ?? "System", target: a.title, slug: a.slug, changes: d.changes, before: d.restorable ? d.before : undefined, restorable: d.restorable });
      return a;
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException("Ce slug existe déjà");
      throw e;
    }
  }

  async remove(slug: string, actor?: Actor) {
    const prev = await this.model.findOne({ slug }).lean();
    if (!prev) throw new NotFoundException("Article introuvable");
    await this.model.deleteOne({ slug });
    const snap = snapshot(prev);
    await this.act.record({ kind: "article", action: "delete", actorId: actor?.id ?? undefined, actorName: actor?.name ?? "System", target: prev.title, slug: prev.slug, before: snap ?? undefined, restorable: !!snap });
    return { ok: true };
  }

  categories() { return this.model.distinct("cat"); }

  /** Données du widget Content Overview + alertes SEO */
  async summary() {
    const all = await this.model.find().select("title meta alt status date").lean();
    const bad = { title: 0, meta: 0, alt: 0 };
    for (const a of all) { const c = seoChecks(a); (Object.keys(bad) as (keyof typeof bad)[]).forEach(k => { if (!c[k]) bad[k]++; }); }
    const count = (s: string) => all.filter(a => a.status === s).length;
    return { total: all.length, live: count("Live"), scheduled: count("Scheduled"), draft: count("Draft"), seoIssues: bad };
  }

  /** Calendrier éditorial : articles d'un mois (YYYY-MM) */
  calendar(month: string) {
    return this.model.find({ date: new RegExp(`^${month}`) }).select("slug title status date cat").sort({ date: 1 }).lean();
  }
}
