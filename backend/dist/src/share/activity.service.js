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
exports.ActivityService = void 0;
exports.diffArticle = diffArticle;
exports.snapshot = snapshot;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const activity_schema_1 = require("./activity.schema");
const TRACK = ["title", "meta", "sub", "cat", "t", "html", "date", "time", "status", "slug", "img", "alt", "coverPrompt"];
const norm = (f, v) => (f === "t" ? (Array.isArray(v) ? v.filter(Boolean) : []) : v ?? "");
const size = (v) => JSON.stringify(v ?? "").length;
const disp = (f, v) => {
    if (f === "html")
        return `${String(v ?? "").replace(/<[^>]*>/g, "").length} chars`;
    if (f === "img")
        return !v ? "none" : String(v).startsWith("data:") ? "uploaded image" : String(v).slice(0, 120);
    if (Array.isArray(v))
        return v.filter(Boolean).join(", ") || "none";
    return String(v ?? "").slice(0, 160) || "empty";
};
/** Différences champ par champ + valeurs précédentes (pour pouvoir restaurer) */
function diffArticle(prev, next) {
    const changes = [];
    const before = {};
    let restorable = true;
    for (const f of TRACK) {
        if (JSON.stringify(norm(f, prev[f])) === JSON.stringify(norm(f, next[f])))
            continue;
        changes.push({ f, from: disp(f, prev[f]), to: disp(f, next[f]) });
        if (size(prev[f]) > 400_000)
            restorable = false;
        else
            before[f] = prev[f] ?? (f === "t" ? [] : "");
    }
    return { changes, before, restorable };
}
function snapshot(doc) {
    const { _id, __v, createdAt, updatedAt, ...rest } = doc;
    return size(rest) < 900_000 ? rest : null;
}
let ActivityService = class ActivityService {
    m;
    log = new common_1.Logger("Activity");
    constructor(m) {
        this.m = m;
    }
    /** Ne fait jamais échouer l'action métier */
    async record(e) {
        try {
            await this.m.create(e);
        }
        catch (err) {
            this.log.warn(`journal indisponible : ${err.message}`);
        }
    }
    get(id) { return this.m.findById(id).select("+before"); }
    markRestored(id) { return this.m.updateOne({ _id: id }, { restoredAt: new Date() }); }
    async list(kind = "all", before, limit = 30) {
        const q = kind === "open" ? { kind: "open" } : kind === "article" ? { kind: "article" } : kind === "share" ? { kind: "share" } : { kind: { $in: ["article", "share"] } };
        if (before && !isNaN(+new Date(before)))
            q.createdAt = { $lt: new Date(before) };
        const n = Math.min(Math.max(limit || 30, 1), 100);
        const rows = await this.m.find(q).sort({ createdAt: -1 }).limit(n + 1).lean();
        const items = rows.slice(0, n).map(({ _id, ...r }) => ({ _id: String(_id), ...r }));
        return { items, next: rows.length > n ? new Date(items[n - 1].createdAt).toISOString() : null };
    }
};
exports.ActivityService = ActivityService;
exports.ActivityService = ActivityService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(activity_schema_1.Activity.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ActivityService);
