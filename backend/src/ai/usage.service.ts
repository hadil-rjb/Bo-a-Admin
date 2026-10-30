import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel, Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { setUsageSink, UsageEntry } from "./usage";

/** One Claude response: who it was for, what for, its tokens and its cost in $ */
@Schema({ collection: "ai_usage", versionKey: false })
export class AiUsage {
  @Prop({ type: String, default: null, index: true }) brandId: string | null;
  @Prop({ required: true }) feature: string;
  @Prop({ required: true }) model: string;
  @Prop({ default: 0 }) input: number;
  @Prop({ default: 0 }) output: number;
  @Prop({ default: 0 }) cacheWrite: number;
  @Prop({ default: 0 }) cacheRead: number;
  @Prop({ default: 0 }) cost: number;
  @Prop({ default: true }) priced: boolean;
  @Prop({ required: true, index: true }) at: Date;
}
export const AiUsageSchema = SchemaFactory.createForClass(AiUsage);

const SUMS = {
  calls: { $sum: 1 }, input: { $sum: "$input" }, output: { $sum: "$output" }, cacheWrite: { $sum: "$cacheWrite" }, cacheRead: { $sum: "$cacheRead" },
  cost: { $sum: "$cost" }, unpriced: { $sum: { $cond: ["$priced", 0, 1] } },
};

@Injectable()
export class UsageService implements OnModuleInit {
  private log = new Logger("AiUsage");
  constructor(@InjectModel(AiUsage.name) private usage: Model<AiUsage>) {}

  onModuleInit() {
    setUsageSink((e: UsageEntry) => { this.usage.create(e).catch((err) => this.log.warn(`Could not record Claude usage: ${err?.message || err}`)); });
  }

  /** Totals across all brands, then per brand, per feature, per model and per day, over the last `days` days */
  async summary(days: number, tz = "UTC") {
    const from = new Date(Date.now() - days * 86_400_000);
    const by = (key: unknown, sort: Record<string, 1 | -1> = { cost: -1 }) => [{ $group: { _id: key, ...SUMS } }, { $sort: sort }];
    const [r] = await this.usage.aggregate([
      { $match: { at: { $gte: from } } },
      { $facet: {
        total: [{ $group: { _id: null, ...SUMS } }],
        brands: by("$brandId"),
        features: by({ brandId: "$brandId", feature: "$feature" }),
        models: by("$model"),
        daily: by({ day: { $dateToString: { date: "$at", format: "%Y-%m-%d", timezone: tz } }, brandId: "$brandId" }, { "_id.day": 1 }),
      } },
    ]);
    const clean = ({ _id, ...v }: any) => v;
    const zero = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, unpriced: 0 };
    return {
      days, from: from.toISOString(),
      total: r.total[0] ? clean(r.total[0]) : zero,
      brands: r.brands.map((b: any) => ({ brandId: b._id, ...clean(b) })),
      features: r.features.map((f: any) => ({ brandId: f._id.brandId, feature: f._id.feature, ...clean(f) })),
      models: r.models.map((m: any) => ({ model: m._id, ...clean(m) })),
      daily: r.daily.map((d: any) => ({ day: d._id.day, brandId: d._id.brandId, cost: d.cost, input: d.input, output: d.output, calls: d.calls })),
    };
  }
}
