"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArticlesService = exports.seoChecks = exports.slugify = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const article_schema_1 = require("./article.schema");
const activity_service_1 = require("../share/activity.service");
const framer_settings_schema_1 = require("../framer/framer-settings.schema");
const time_1 = require("../framer/time");
const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
exports.slugify = slugify;
/** Mêmes contrôles SEO que le front */
const seoChecks = (a) => ({
    title: a.title.length > 0 && a.title.length <= 60,
    meta: a.meta.length >= 120 && a.meta.length <= 160,
    alt: a.alt.trim().length > 0,
});
exports.seoChecks = seoChecks;
let ArticlesService = class ArticlesService {
    model;
    framerSettings;
    act;
    constructor(model, framerSettings, act) {
        this.model = model;
        this.framerSettings = framerSettings;
        this.act = act;
    }
    list({ q, status, cat, full }) {
        const f = {};
        if (status)
            f.status = status;
        if (cat)
            f.cat = cat;
        if (q)
            f.$or = ["title", "cat", "t", "slug"].map(k => ({ [k]: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }));
        const query = this.model.find(f).sort({ date: -1 });
        return (full === "1" ? query : query.select("-html")).lean();
    }
    async get(slug) {
        const a = await this.model.findOne({ slug }).lean();
        if (!a)
            throw new common_1.NotFoundException("Article introuvable");
        return a;
    }
    /** Articles réellement planifiés dans le futur, avec leur instant de publication UTC. */
    async upcoming() {
        const settings = await this.framerSettings.findOne().lean();
        const timezone = settings?.timezone || process.env.PUBLISH_TIMEZONE || "Africa/Tunis";
        const now = Date.now();
        const rows = await this.model.find({ status: "Scheduled", date: { $ne: "" } }).select("-html").lean();
        return rows
            .map((a) => ({ ...a, scheduledAt: (0, time_1.zonedToUtc)(a.date, a.time || "09:00", timezone).toISOString() }))
            .filter((a) => Number.isFinite(Date.parse(a.scheduledAt)) && Date.parse(a.scheduledAt) > now)
            .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    }
    async create(dto, actor) {
        const slug = dto.slug ?? (0, exports.slugify)(dto.title);
        try {
            const a = await this.model.create({ ...dto, slug });
            await this.act.record({ kind: "article", action: "create", actorId: actor?.id ?? undefined, actorName: actor?.name ?? "System", target: a.title, slug: a.slug });
            return a;
        }
        catch (e) {
            if (e?.code === 11000)
                throw new common_1.ConflictException(`Le slug « ${slug} » existe déjà`);
            throw e;
        }
    }
    async update(slug, dto, actor) {
        try {
            const prev = await this.model.findOne({ slug }).lean();
            if (!prev)
                throw new common_1.NotFoundException("Article introuvable");
            // changer date / heure / statut relance le cycle de publication Framer (compteur d'essais remis à zéro)
            const reset = ("date" in dto || "time" in dto || "status" in dto) && dto.status !== "Live" ? { framerTries: 0, framerNote: "", framerState: "" } : {};
            const a = await this.model.findOneAndUpdate({ slug }, { $set: { ...dto, ...reset }, ...(reset.framerTries === 0 ? { $unset: { framerNextTry: 1, framerLock: 1 } } : {}) }, { new: true }).lean();
            if (!a)
                throw new common_1.NotFoundException("Article introuvable");
            const d = (0, activity_service_1.diffArticle)(prev, a);
            if (d.changes.length)
                await this.act.record({ kind: "article", action: "update", actorId: actor?.id ?? undefined, actorName: actor?.name ?? "System", target: a.title, slug: a.slug, changes: d.changes, before: d.restorable ? d.before : undefined, restorable: d.restorable });
            return a;
        }
        catch (e) {
            if (e?.code === 11000)
                throw new common_1.ConflictException("Ce slug existe déjà");
            throw e;
        }
    }
    async remove(slug, actor) {
        const prev = await this.model.findOne({ slug }).lean();
        if (!prev)
            throw new common_1.NotFoundException("Article introuvable");
        await this.model.deleteOne({ slug });
        const snap = (0, activity_service_1.snapshot)(prev);
        await this.act.record({ kind: "article", action: "delete", actorId: actor?.id ?? undefined, actorName: actor?.name ?? "System", target: prev.title, slug: prev.slug, before: snap ?? undefined, restorable: !!snap });
        return { ok: true };
    }
    categories() { return this.model.distinct("cat"); }
    /** Données du widget Content Overview + alertes SEO */
    async summary() {
        const all = await this.model.find().select("title meta alt status date").lean();
        const bad = { title: 0, meta: 0, alt: 0 };
        for (const a of all) {
            const c = (0, exports.seoChecks)(a);
            Object.keys(bad).forEach(k => { if (!c[k])
                bad[k]++; });
        }
        const count = (s) => all.filter(a => a.status === s).length;
        return { total: all.length, live: count("Live"), scheduled: count("Scheduled"), draft: count("Draft"), seoIssues: bad };
    }
    /** Calendrier éditorial : articles d'un mois (YYYY-MM) */
    calendar(month) {
        return this.model.find({ date: new RegExp(`^${month}`) }).select("slug title status date cat").sort({ date: 1 }).lean();
    }
};
exports.ArticlesService = ArticlesService;
exports.ArticlesService = ArticlesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(article_schema_1.Article.name)),
    __param(1, (0, mongoose_1.InjectModel)(framer_settings_schema_1.FramerSettings.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        activity_service_1.ActivityService])
], ArticlesService);
