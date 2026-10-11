"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShareService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const crypto_1 = require("crypto");
const bcrypt = __importStar(require("bcryptjs"));
const user_schema_1 = require("../auth/user.schema");
const article_schema_1 = require("../articles/article.schema");
const share_settings_schema_1 = require("./share-settings.schema");
const activity_service_1 = require("./activity.service");
const ONLINE_MS = 45_000;
const newToken = () => (0, crypto_1.randomBytes)(24).toString("base64url");
const tempPassword = () => (0, crypto_1.randomBytes)(9).toString("base64url").replace(/[-_]/g, "x") + "Aa1"; // respecte la règle 8+/maj/min/chiffre
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && (0, crypto_1.timingSafeEqual)(x, y); };
const RN = { admin: "Owner", editor: "Editor", viewer: "Viewer" };
let ShareService = class ShareService {
    users;
    articles;
    settings;
    act;
    /** Présence en mémoire (instance unique) : clé = id utilisateur ou "link:<visiteur>" */
    presence = new Map();
    seen = new Map();
    opened = new Map();
    constructor(users, articles, settings, act) {
        this.users = users;
        this.articles = articles;
        this.settings = settings;
        this.act = act;
    }
    async cfg() {
        return (await this.settings.findOne()) ?? (await this.settings.create({ linkEnabled: false, linkToken: newToken() }));
    }
    userById(id) { return this.users.findById(id).select("name email role").lean(); }
    async checkLink(token) { const c = await this.cfg(); return c.linkEnabled && same(c.linkToken, token); }
    online(id) { const p = this.presence.get(id); return !!p && Date.now() - p.at < ONLINE_MS; }
    async state(me) {
        const [c, us] = await Promise.all([this.cfg(), this.users.find().select("name email role avatar lastActiveAt createdAt").sort({ createdAt: 1 }).lean()]);
        return {
            me: { id: me.sub, role: me.role },
            members: us.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, avatar: u.avatar || "", lastActiveAt: u.lastActiveAt ?? null, online: this.online(String(u._id)) })),
            link: { enabled: c.linkEnabled, token: me.role === "admin" ? c.linkToken : undefined },
        };
    }
    async invite(actor, dto) {
        const email = dto.email.toLowerCase().trim();
        if (await this.users.exists({ email }))
            throw new common_1.ConflictException("Cette personne a déjà accès");
        const password = tempPassword();
        const u = await this.users.create({ email, name: dto.name.trim(), role: dto.role, passwordHash: await bcrypt.hash(password, 12) });
        await this.act.record({ kind: "share", action: "invite", actorId: actor.id ?? undefined, actorName: actor.name, target: `${u.name} (${RN[dto.role]})` });
        return { member: { id: u.id, name: u.name, email: u.email, role: u.role }, tempPassword: password };
    }
    async target(actor, id) {
        const u = await this.users.findById(id);
        if (!u)
            throw new common_1.NotFoundException("Utilisateur introuvable");
        if (u.role === "admin")
            throw new common_1.BadRequestException("Le propriétaire ne peut pas être modifié");
        if (actor.id === id)
            throw new common_1.BadRequestException("Vous ne pouvez pas modifier votre propre accès");
        return u;
    }
    async setRole(actor, id, role) {
        const u = await this.target(actor, id);
        u.role = role;
        await u.save();
        await this.act.record({ kind: "share", action: "role", actorId: actor.id ?? undefined, actorName: actor.name, target: `${u.name} → ${RN[role]}` });
        return { ok: true };
    }
    async remove(actor, id) {
        const u = await this.target(actor, id);
        await u.deleteOne();
        this.presence.delete(id);
        await this.act.record({ kind: "share", action: "remove", actorId: actor.id ?? undefined, actorName: actor.name, target: u.name });
        return { ok: true };
    }
    async setLink(actor, dto) {
        const c = await this.cfg();
        if (dto.regenerate) {
            c.linkToken = newToken();
            await c.save();
            await this.act.record({ kind: "share", action: "reset", actorId: actor.id ?? undefined, actorName: actor.name, target: "" });
        }
        if (typeof dto.enabled === "boolean" && dto.enabled !== c.linkEnabled) {
            c.linkEnabled = dto.enabled;
            await c.save();
            await this.act.record({ kind: "share", action: "link", actorId: actor.id ?? undefined, actorName: actor.name, target: dto.enabled ? "on" : "off" });
        }
        return { enabled: c.linkEnabled, token: c.linkToken };
    }
    /** Heartbeat : présence en direct + dernière activité + journal « ouvert par » (1 entrée / 30 min / personne) */
    async ping(user, viewerId) {
        const link = user.role === "link";
        const key = link ? "link:" + (String(viewerId ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || "anon") : String(user.sub);
        const name = link ? "Guest (link)" : user.name;
        const now = Date.now();
        this.presence.set(key, { id: key, name, link, at: now });
        for (const [k, v] of this.presence)
            if (now - v.at > 300_000)
                this.presence.delete(k);
        if (!link && now - (this.seen.get(key) ?? 0) > 60_000) {
            this.seen.set(key, now);
            await this.users.updateOne({ _id: key }, { lastActiveAt: new Date(now) });
        }
        if (now - (this.opened.get(key) ?? 0) > 30 * 60_000) {
            this.opened.set(key, now);
            await this.act.record({ kind: "open", action: link ? "open-link" : "open", actorId: link ? undefined : key, actorName: name });
        }
        return { viewers: [...this.presence.values()].filter(v => now - v.at < ONLINE_MS).map(v => ({ id: v.id, name: v.name, link: v.link, you: v.id === key })) };
    }
    /** Restaure une version : annule une modification ou recrée un article supprimé */
    async restore(actor, id) {
        const a = await this.act.get(id);
        if (!a || a.kind !== "article" || !a.restorable || a.restoredAt || !a.before)
            throw new common_1.BadRequestException("Cette version ne peut pas être restaurée");
        try {
            if (a.action === "update") {
                const r = await this.articles.findOneAndUpdate({ slug: a.slug }, { $set: a.before }, { new: true }).lean();
                if (!r)
                    throw new common_1.NotFoundException("L'article n'existe plus");
            }
            else if (a.action === "delete") {
                await this.articles.create(a.before);
            }
            else
                throw new common_1.BadRequestException("Cette version ne peut pas être restaurée");
        }
        catch (e) {
            if (e?.code === 11000)
                throw new common_1.ConflictException("Un article avec ce slug existe déjà");
            throw e;
        }
        await this.act.markRestored(id);
        await this.act.record({ kind: "article", action: "restore", actorId: actor.id ?? undefined, actorName: actor.name, target: a.target, slug: a.before.slug ?? a.slug });
        return { ok: true };
    }
};
exports.ShareService = ShareService;
exports.ShareService = ShareService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(article_schema_1.Article.name)),
    __param(2, (0, mongoose_1.InjectModel)(share_settings_schema_1.ShareSettings.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        activity_service_1.ActivityService])
], ShareService);
