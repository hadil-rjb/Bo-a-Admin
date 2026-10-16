import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Article, ArticleDocument } from "../articles/article.schema";
import { FramerService } from "./framer.service";
import { zonedToUtc } from "./time";

const TICK_MS = 30_000;
const MAX_TRIES = 5;          // ensuite l'article reste « Scheduled » avec l'erreur affichée ; « Retry » le relance
const LOCK_MS = 10 * 60_000;  // verrou : évite une double publication (plusieurs instances / tick qui se chevauchent)

/** Toutes les 30 s : les articles « Scheduled » dont date + heure sont atteintes sont envoyés dans Framer et publiés. */
@Injectable()
export class FramerScheduler implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("FramerScheduler");
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private framer: FramerService, @InjectModel(Article.name) private articles: Model<ArticleDocument>) {}

  onModuleInit() { this.timer = setInterval(() => void this.tick(), TICK_MS); setTimeout(() => void this.tick(), 5_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const s = await this.framer.load();
      if (!s.enabled) return;
      const now = Date.now();
      // marge d'1 jour sur la date pour couvrir tous les fuseaux ; l'instant exact est calculé ensuite
      const horizon = new Date(now + 36 * 3600_000).toISOString().slice(0, 10);
      const rows = await this.articles.find({
        status: "Scheduled", date: { $ne: "", $lte: horizon }, framerTries: { $lt: MAX_TRIES },
        $and: [{ $or: [{ framerNextTry: null }, { framerNextTry: { $lte: new Date(now) } }] }, { $or: [{ framerLock: null }, { framerLock: { $lt: new Date(now - LOCK_MS) } }] }],
      }).select("slug date time").sort({ date: 1, time: 1 }).lean();
      for (const a of rows) {
        if (zonedToUtc(a.date, a.time || "09:00", s.timezone).getTime() > now) continue;
        const claimed = await this.articles.findOneAndUpdate(
          { slug: a.slug, status: "Scheduled", $or: [{ framerLock: null }, { framerLock: { $lt: new Date(now - LOCK_MS) } }] },
          { $set: { framerLock: new Date() } },
        );
        if (!claimed) continue;
        try { await this.framer.runFor(a.slug); this.log.log(`Published “${a.slug}” on Framer`); }
        catch {
          const tries = (claimed.framerTries ?? 0) + 1; // délai croissant : 2, 4, 8, 16 min
          await this.articles.updateOne({ slug: a.slug }, { $set: { framerNextTry: new Date(Date.now() + 2 ** tries * 60_000) } });
        }
      }
    } catch (e: any) { this.log.error(e?.message ?? e); }
    finally { this.busy = false; }
  }
}
