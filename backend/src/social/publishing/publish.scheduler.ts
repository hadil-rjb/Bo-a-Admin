import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PublisherService } from "./publisher.service";

const TICK_MS = Number(process.env.SOCIAL_PUBLISH_TICK_MS) || 30_000;

/** Every 30 s: scheduled social posts whose time has come are published to their networks. */
@Injectable()
export class PublishScheduler implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("SocialScheduler");
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private publisher: PublisherService) {}

  onModuleInit() { this.timer = setInterval(() => void this.tick(), TICK_MS); setTimeout(() => void this.tick(), 5_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const p of await this.publisher.due()) {
        await this.publisher.publish(p.brandId, p.id).catch((e) => this.log.warn(`${p.brandId}/${p.id}: ${e.message}`));
      }
    } catch (e: any) {
      this.log.error(e?.message ?? e);
    } finally {
      this.busy = false;
    }
  }
}
