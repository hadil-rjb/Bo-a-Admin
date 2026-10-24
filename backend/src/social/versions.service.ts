import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { SocialDesign } from "./schemas/design.schema";
import { SocialDesignVersion } from "./schemas/version.schema";
import { hashOf } from "./social.util";

/** Automatic versions kept per design (the newest); named versions are never pruned */
const KEEP_AUTO = 30;

type Actor = { id?: string | null; name?: string };

/**
 * Version history of designs. A version is a snapshot of the design as the API has it (the studio sends its pending
 * changes first), so restoring one gives back exactly what was saved.
 */
@Injectable()
export class VersionsService {
  constructor(
    @InjectModel(SocialDesign.name) private readonly designs: Model<SocialDesign>,
    @InjectModel(SocialDesignVersion.name) private readonly versions: Model<SocialDesignVersion>,
  ) {}

  private summary(v: Record<string, any>) {
    return { id: String(v._id), name: v.name, auto: !!v.auto, rev: v.rev ?? null, ratio: v.ratio, createdAt: v.createdAt, createdByName: v.createdByName || "", bytes: v.bytes || 0, slides: v.slides ?? (Array.isArray(v.pages) ? v.pages.length : 0) };
  }

  async list(brandId: string, designId: string) {
    const rows = await this.versions.find({ brandId, designId }).select({ pages: 0 }).sort({ createdAt: -1 }).limit(200).lean();
    return rows.map((v) => this.summary(v));
  }

  /** Snapshots the stored design. `auto`: skipped when the latest version already has the same content. */
  async create(brandId: string, designId: string, body: { name?: string; auto?: boolean }, by: Actor) {
    const d = await this.designs.findOne({ brandId, id: designId }).lean<Record<string, any>>();
    if (!d) throw new NotFoundException(`Design "${designId}" not found`);
    const pages = d.pages ?? [], hash = hashOf({ pages, ratio: d.ratio });
    if (body.auto) {
      const last = await this.versions.findOne({ brandId, designId }).sort({ createdAt: -1 }).select({ hash: 1 }).lean();
      if (last && last.hash === hash) return { skipped: true };
    }
    const v = await this.versions.create({
      brandId, designId, name: (body.name || "").trim().slice(0, 80) || (body.auto ? "Autosave" : "Version"), auto: !!body.auto,
      hash, rev: d.rev, ratio: d.ratio, pages, createdBy: by.id || undefined, createdByName: by.name || "", bytes: JSON.stringify(pages).length, slides: pages.length,
    });
    if (body.auto) {
      const old = await this.versions.find({ brandId, designId, auto: true }).sort({ createdAt: -1 }).skip(KEEP_AUTO).select({ _id: 1 }).lean();
      if (old.length) await this.versions.deleteMany({ _id: { $in: old.map((o) => o._id) } });
    }
    return this.summary(v.toObject());
  }

  async get(brandId: string, designId: string, vid: string) {
    if (!Types.ObjectId.isValid(vid)) throw new NotFoundException();
    const v = await this.versions.findOne({ _id: vid, brandId, designId }).lean<Record<string, any>>();
    if (!v) throw new NotFoundException("Version not found");
    return { ...this.summary(v), pages: v.pages ?? [] };
  }

  /** Naming an automatic version keeps it */
  async rename(brandId: string, designId: string, vid: string, name: string) {
    if (!Types.ObjectId.isValid(vid)) throw new NotFoundException();
    const v = await this.versions.findOneAndUpdate({ _id: vid, brandId, designId }, { $set: { name: name.trim().slice(0, 80) || "Version", auto: false } }, { new: true }).select({ pages: 0 }).lean();
    if (!v) throw new NotFoundException("Version not found");
    return this.summary(v);
  }

  async remove(brandId: string, designId: string, vid: string) {
    if (!Types.ObjectId.isValid(vid)) throw new NotFoundException();
    const r = await this.versions.deleteOne({ _id: vid, brandId, designId });
    if (!r.deletedCount) throw new NotFoundException("Version not found");
    return { ok: true };
  }

  /** A deleted design's history goes with it */
  async removeFor(list: { brandId: string; id: string }[]) {
    if (list.length) await this.versions.deleteMany({ $or: list.map(({ brandId, id }) => ({ brandId, designId: id })) });
  }
  async removeBrands(brandIds: string[]) {
    if (brandIds.length) await this.versions.deleteMany({ brandId: { $in: brandIds } });
  }
}
