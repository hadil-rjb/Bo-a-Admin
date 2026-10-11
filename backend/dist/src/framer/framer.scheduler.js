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
exports.FramerScheduler = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const article_schema_1 = require("../articles/article.schema");
const framer_service_1 = require("./framer.service");
const time_1 = require("./time");
const TICK_MS = 30_000;
const MAX_TRIES = 5; // ensuite l'article reste « Scheduled » avec l'erreur affichée ; « Retry » le relance
const LOCK_MS = 10 * 60_000; // verrou : évite une double publication (plusieurs instances / tick qui se chevauchent)
/** Toutes les 30 s : les articles « Scheduled » dont date + heure sont atteintes sont envoyés dans Framer et publiés. */
let FramerScheduler = class FramerScheduler {
    framer;
    articles;
    log = new common_1.Logger("FramerScheduler");
    timer;
    busy = false;
    constructor(framer, articles) {
        this.framer = framer;
        this.articles = articles;
    }
    onModuleInit() { this.timer = setInterval(() => void this.tick(), TICK_MS); setTimeout(() => void this.tick(), 5_000); }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
    async tick() {
        if (this.busy)
            return;
        this.busy = true;
        try {
            const s = await this.framer.load();
            if (!s.enabled)
                return;
            const now = Date.now();
            // marge d'1 jour sur la date pour couvrir tous les fuseaux ; l'instant exact est calculé ensuite
            const horizon = new Date(now + 36 * 3600_000).toISOString().slice(0, 10);
            const rows = await this.articles.find({
                status: "Scheduled", date: { $ne: "", $lte: horizon }, framerTries: { $lt: MAX_TRIES },
                $and: [{ $or: [{ framerNextTry: null }, { framerNextTry: { $lte: new Date(now) } }] }, { $or: [{ framerLock: null }, { framerLock: { $lt: new Date(now - LOCK_MS) } }] }],
            }).select("slug date time").sort({ date: 1, time: 1 }).lean();
            for (const a of rows) {
                if ((0, time_1.zonedToUtc)(a.date, a.time || "09:00", s.timezone).getTime() > now)
                    continue;
                const claimed = await this.articles.findOneAndUpdate({ slug: a.slug, status: "Scheduled", $or: [{ framerLock: null }, { framerLock: { $lt: new Date(now - LOCK_MS) } }] }, { $set: { framerLock: new Date() } });
                if (!claimed)
                    continue;
                try {
                    await this.framer.runFor(a.slug);
                    this.log.log(`Published “${a.slug}” on Framer`);
                }
                catch {
                    const tries = (claimed.framerTries ?? 0) + 1; // délai croissant : 2, 4, 8, 16 min
                    await this.articles.updateOne({ slug: a.slug }, { $set: { framerNextTry: new Date(Date.now() + 2 ** tries * 60_000) } });
                }
            }
        }
        catch (e) {
            this.log.error(e?.message ?? e);
        }
        finally {
            this.busy = false;
        }
    }
};
exports.FramerScheduler = FramerScheduler;
exports.FramerScheduler = FramerScheduler = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, mongoose_1.InjectModel)(article_schema_1.Article.name)),
    __metadata("design:paramtypes", [framer_service_1.FramerService, mongoose_2.Model])
], FramerScheduler);
