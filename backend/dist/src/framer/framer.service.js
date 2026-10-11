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
exports.FramerService = exports.MAP_KEYS = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const crypto_1 = require("../common/crypto");
const article_schema_1 = require("../articles/article.schema");
const activity_service_1 = require("../share/activity.service");
const framer_settings_schema_1 = require("./framer-settings.schema");
const framer_client_1 = require("./framer.client");
const time_1 = require("./time");
/** Champs de l'article → noms de champs Framer reconnus automatiquement (insensible à la casse). */
exports.MAP_KEYS = ["title", "meta", "sub", "cat", "tags", "html", "img", "alt", "date"];
const GUESS = {
    title: ["title", "name", "headline"],
    meta: ["meta description", "description", "meta", "seo description", "excerpt", "summary"],
    sub: ["subtitle", "sub title", "subheading", "sub"],
    cat: ["category", "categories"],
    tags: ["tags", "tag"],
    html: ["content", "body", "article", "post", "text"],
    img: ["cover image", "cover", "featured image", "thumbnail", "image", "hero image"],
    alt: ["alt text", "image alt", "cover alt", "alt"],
    date: ["publish date", "published at", "published", "publication date", "date"],
};
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const abs = (u, base) => (u.startsWith("/") ? base.replace(/\/$/, "") + u : u);
let FramerService = class FramerService {
    settings;
    articles;
    act;
    log = new common_1.Logger("Framer");
    secret;
    publicApi;
    running = false; // une seule synchronisation à la fois (une connexion WebSocket = un projet)
    constructor(settings, articles, act, cfg) {
        this.settings = settings;
        this.articles = articles;
        this.act = act;
        this.secret = cfg.getOrThrow("JWT_SECRET");
        this.publicApi = cfg.get("PUBLIC_API_URL") ?? "http://localhost:4000";
    }
    /* ───────────── Réglages ───────────── */
    async load() { return (await this.settings.findOne().select("+apiKey")) ?? (await this.settings.create({ timezone: process.env.PUBLISH_TIMEZONE || "Africa/Tunis" })); }
    creds(s) {
        let key = process.env.FRAMER_API_KEY || "";
        if (s.apiKey) {
            try {
                key = (0, crypto_1.decrypt)(s.apiKey, this.secret);
            }
            catch { /* clé illisible (JWT_SECRET changé) */ }
        }
        return { url: s.projectUrl || process.env.FRAMER_PROJECT_URL || "", key };
    }
    async view() {
        const s = await this.load(), { url, key } = this.creds(s);
        const counts = await this.articles.aggregate([{ $match: { status: "Scheduled" } }, { $group: { _id: "$framerState", n: { $sum: 1 } } }]);
        return {
            enabled: s.enabled, projectUrl: url, hasKey: !!key, last4: key ? key.slice(-4) : "", collectionId: s.collectionId, collectionName: s.collectionName,
            fieldMap: s.fieldMap ?? {}, publish: s.publish, deploy: s.deploy, timezone: s.timezone,
            ready: !!(url && key && s.collectionId), pendingErrors: counts.find(c => c._id === "error")?.n ?? 0,
        };
    }
    /** Version minimale pour les éditeurs (aucun secret) */
    async status() { const v = await this.view(); return { enabled: v.enabled, ready: v.ready, timezone: v.timezone, publish: v.publish, deploy: v.deploy }; }
    async update(dto, actor) {
        const s = await this.load();
        if (dto.projectUrl !== undefined) {
            s.projectUrl = (0, framer_client_1.parseFramerProject)(dto.projectUrl); // lève une erreur claire si l'URL n'est pas celle d'un projet Framer
        }
        if (dto.apiKey?.trim())
            s.apiKey = (0, crypto_1.encrypt)(dto.apiKey.trim(), this.secret);
        if (dto.clearKey)
            s.apiKey = undefined;
        if (dto.timezone) {
            if (!(0, time_1.validTz)(dto.timezone))
                throw new common_1.BadRequestException("Unknown time zone (use e.g. Africa/Tunis, Europe/Paris)");
            s.timezone = dto.timezone;
        }
        if (dto.publish !== undefined)
            s.publish = dto.publish;
        if (dto.deploy !== undefined)
            s.deploy = dto.deploy;
        if (dto.fieldMap) {
            s.fieldMap = Object.fromEntries(exports.MAP_KEYS.map(k => [k, String(dto.fieldMap[k] ?? "")]));
            s.markModified("fieldMap");
        }
        if (dto.collectionId !== undefined && dto.collectionId !== s.collectionId) {
            s.collectionId = dto.collectionId;
            s.collectionName = "";
            s.fieldMap = {};
            s.markModified("fieldMap");
        }
        await s.save(); // on enregistre d'abord : une connexion refusée ne fait pas perdre l'URL / la clé saisies
        // Vérifie la connexion avant d'activer (clé valide + collection existante)
        const { url, key } = this.creds(s);
        if (dto.enabled === true || dto.apiKey?.trim() || dto.collectionId) {
            const cols = await (0, framer_client_1.withFramer)(url, key, async (f) => (await f.getCollections()).map((c) => ({ id: c.id, name: c.name })));
            if (s.collectionId) {
                const c = cols.find((x) => x.id === s.collectionId);
                if (!c)
                    throw new common_1.BadRequestException("That CMS collection no longer exists in the Framer project");
                s.collectionName = c.name;
            }
        }
        if (dto.enabled !== undefined) {
            if (dto.enabled && !(url && key && s.collectionId))
                throw new common_1.BadRequestException("Add the project URL, API key and pick the blog collection before enabling auto-publish");
            s.enabled = dto.enabled;
        }
        await s.save();
        await this.act.record({ kind: "share", action: "framer", actorId: actor.id ?? undefined, actorName: actor.name, target: `Framer · ${s.enabled ? "auto-publish on" : "off"}${s.collectionName ? " · " + s.collectionName : ""}` });
        return this.view();
    }
    /** Collections du projet (pour choisir la collection « blog ») */
    async collections() {
        const s = await this.load(), { url, key } = this.creds(s);
        return (0, framer_client_1.withFramer)(url, key, async (f) => (await f.getCollections()).map((c) => ({ id: c.id, name: c.name, managedBy: c.managedBy })));
    }
    /** Champs de la collection choisie + correspondance automatique proposée */
    async fields() {
        const s = await this.load(), { url, key } = this.creds(s);
        if (!s.collectionId)
            throw new common_1.BadRequestException("Pick the blog collection first");
        return (0, framer_client_1.withFramer)(url, key, async (f) => {
            const col = await f.getCollection(s.collectionId);
            if (!col)
                throw new common_1.NotFoundException("Collection not found");
            const fields = (await col.getFields()).map((x) => ({ id: x.id, name: x.name, type: x.type }));
            const tf = this.tagFields(fields), img = this.autoField("img", fields);
            const names = Object.fromEntries(exports.MAP_KEYS.map(k => [k, this.autoField(k, fields)?.name ?? ""]));
            if (tf.length)
                names.tags = tf.map(f => f.name).join(" + ");
            if (!names.alt && img)
                names.alt = `${img.name} (alt text)`; // l'alt vit dans le champ image lui-même
            return { fields, auto: Object.fromEntries(exports.MAP_KEYS.map(k => [k, this.autoField(k, fields)?.id ?? ""])), autoNames: names };
        });
    }
    /** Champs « Tag 1 / Tag 2 / Tag 3 … » (triés par numéro) */
    tagFields(fields) {
        const n = (f) => { const m = /^tags?\s*(\d+)$/.exec(norm(f.name)); return m ? +m[1] : 0; };
        return fields.filter(f => n(f) > 0).sort((a, b) => n(a) - n(b));
    }
    autoField(k, fields) {
        for (const g of GUESS[k]) {
            const f = fields.find(x => norm(x.name) === g);
            if (f)
                return f;
        }
        return undefined;
    }
    /* ───────────── Synchronisation d'un article ───────────── */
    /** Ajoute (ou met à jour) l'article dans la collection CMS, puis publie le site. Idempotent : le slug identifie l'élément. */
    async syncArticle(slug) {
        if (this.running)
            throw new common_1.BadRequestException("Another Framer publish is in progress — try again in a moment");
        this.running = true;
        try {
            const s = await this.load(), { url, key } = this.creds(s);
            if (!url || !key || !s.collectionId)
                throw new common_1.BadRequestException("Framer is not configured (Settings → Framer)");
            const a = await this.articles.findOne({ slug }).lean();
            if (!a)
                throw new common_1.NotFoundException("Article introuvable");
            return await (0, framer_client_1.withFramer)(url, key, async (f) => {
                const col = await f.getCollection(s.collectionId);
                if (!col)
                    throw new common_1.BadRequestException("The CMS collection no longer exists in Framer");
                const fields = await col.getFields();
                const notes = [];
                const data = {};
                for (const k of exports.MAP_KEYS) {
                    const pick = s.fieldMap?.[k];
                    if (pick === "-")
                        continue;
                    if (k === "tags" && !pick) {
                        const tf = this.tagFields(fields);
                        if (tf.length) { // un tag par champ : Tag 1, Tag 2, Tag 3…
                            const tags = (a.t ?? []).map((x) => String(x).trim()).filter(Boolean);
                            tf.forEach((fld, i) => { const v = this.text(tags[i] ?? "", fld.type); if (v)
                                data[fld.id] = v; });
                            if (tags.length > tf.length)
                                notes.push(`${tags.length - tf.length} tag(s) not sent: the collection only has ${tf.length} tag field(s)`);
                            continue;
                        }
                    }
                    const fld = pick ? fields.find(x => x.id === pick) : this.autoField(k, fields);
                    if (!fld) {
                        if (["title", "html"].includes(k))
                            notes.push(`No Framer field matched “${k}”`);
                        continue;
                    }
                    const v = await this.value(k, a, fld, f, notes, s.timezone);
                    if (v)
                        data[fld.id] = v;
                }
                const items = await col.getItems();
                const existing = items.find(i => i.slug === a.slug);
                if (existing)
                    await existing.setAttributes({ slug: a.slug, draft: false, fieldData: data }); // fieldData obligatoire, sinon ignoré en silence
                else
                    await col.addItems([{ slug: a.slug, draft: false, fieldData: data }]);
                const id = existing?.id ?? (await col.getItems()).find((i) => i.slug === a.slug)?.id ?? "";
                let preview = [];
                if (s.publish) {
                    const r = await f.publish(); // déploiement « preview »
                    preview = r?.hostnames?.map((h) => h.hostname ?? h) ?? [];
                    if (s.deploy)
                        await f.deploy(r.deployment.id); // promotion en production
                }
                return { itemId: String(id), note: notes.join(" · "), preview };
            });
        }
        finally {
            this.running = false;
        }
    }
    async value(k, a, fld, f, notes, tz) {
        const t = fld.type;
        const text = (s) => this.text(s, t);
        switch (k) {
            case "title": return text(a.title);
            case "meta": return text(a.meta || "");
            case "sub": return text(a.sub || "");
            case "alt": return text(a.alt || "");
            case "cat": {
                if (t === "enum") {
                    const c = (fld.cases ?? []).find((x) => norm(x.name) === norm(a.cat));
                    if (!c) {
                        if (a.cat)
                            notes.push(`Category “${a.cat}” is not an option of the Framer field`);
                        return null;
                    }
                    return { type: t, value: c.id ?? c.name };
                }
                return text(a.cat || "");
            }
            case "tags": return text((a.t ?? []).filter(Boolean).join(", "));
            case "html": return t === "formattedText" || t === "string" ? { type: t, value: a.html || "" } : null;
            case "date": return t === "date" && a.date ? { type: t, value: (0, time_1.zonedToUtc)(a.date, a.time || "09:00", tz).toISOString() } : null;
            case "img": {
                if (t !== "image" || !a.img)
                    return null;
                try {
                    const asset = await this.upload(f, a.img, a.alt);
                    return { type: t, value: asset.url, ...(a.alt ? { alt: a.alt } : {}) };
                } // alt text = propriété du champ image
                catch (e) {
                    notes.push(`Cover image not transferred (${String(e?.message ?? e).slice(0, 80)})`);
                    return null;
                }
            }
        }
    }
    text(s, t) { return t === "formattedText" ? { type: t, value: s ? `<p>${esc(s)}</p>` : "" } : t === "string" ? { type: t, value: s } : null; }
    /** Télécharge l'image côté serveur (data-URL, /api/media/… ou http) puis l'envoie à Framer en octets : fonctionne même en local. */
    async upload(f, src, alt) {
        let bytes, mimeType;
        const m = /^data:([^;]+);base64,(.+)$/s.exec(src);
        if (m) {
            mimeType = m[1];
            bytes = new Uint8Array(Buffer.from(m[2], "base64"));
        }
        else {
            const r = await fetch(abs(src, this.publicApi), { signal: AbortSignal.timeout(20_000) });
            if (!r.ok)
                throw new Error(`image HTTP ${r.status}`);
            mimeType = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
            bytes = new Uint8Array(await r.arrayBuffer());
        }
        return f.uploadImage({ image: { bytes, mimeType }, altText: alt || undefined });
    }
    /* ───────────── Résultat enregistré sur l'article ───────────── */
    async runFor(slug, actor) {
        try {
            const r = await this.syncArticle(slug);
            await this.articles.updateOne({ slug }, { $set: { status: "Live", framerState: "synced", framerItemId: r.itemId, framerSyncedAt: new Date(), framerNote: r.note, framerTries: 0 }, $unset: { framerNextTry: 1, framerLock: 1 } });
            await this.act.record({ kind: "article", action: "framer-publish", actorId: actor?.id ?? undefined, actorName: actor?.name ?? "Scheduler", target: slug, slug });
            return { ok: true, ...r };
        }
        catch (e) {
            const msg = String(e?.response?.message ?? e?.message ?? e).slice(0, 300);
            this.log.warn(`${slug}: ${msg}`);
            await this.articles.updateOne({ slug }, { $set: { framerState: "error", framerNote: msg }, $inc: { framerTries: 1 }, $unset: { framerLock: 1 } });
            throw e;
        }
    }
};
exports.FramerService = FramerService;
exports.FramerService = FramerService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(framer_settings_schema_1.FramerSettings.name)),
    __param(1, (0, mongoose_1.InjectModel)(article_schema_1.Article.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        activity_service_1.ActivityService,
        config_1.ConfigService])
], FramerService);
