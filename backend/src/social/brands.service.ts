import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CreateBrandDto, CreateDesignDto, CreatePostDto } from "./dto/resource.dto";
import { SocialBrand } from "./schemas/brand.schema";
import { SocialDesign } from "./schemas/design.schema";
import { SocialPost } from "./schemas/post.schema";
import { SocialWorkspace, WORKSPACE_ID } from "./schemas/workspace.schema";
import { hashOf, newId, strip } from "./social.util";
import { ConnectionsService } from "./publishing/connections.service";
import { PublisherService } from "./publishing/publisher.service";

/** Fields a client may not overwrite through PATCH */
const LOCKED = ["_id", "id", "brandId", "order", "hash", "createdAt", "updatedAt", "publish", "media"];
/** Darken/lighten a hex color, same as the studio's shade() */
const shade = (h: string, k: number) => {
  const n = parseInt(h.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
};
const editable = (body: Record<string, unknown>) => Object.fromEntries(Object.entries(body).filter(([k]) => !LOCKED.includes(k)));

/** REST access to brands, designs and posts (for integrations, scripts and future clients). */
@Injectable()
export class BrandsService {
  constructor(
    @InjectModel(SocialBrand.name) private readonly brands: Model<SocialBrand>,
    @InjectModel(SocialDesign.name) private readonly designs: Model<SocialDesign>,
    @InjectModel(SocialPost.name) private readonly posts: Model<SocialPost>,
    @InjectModel(SocialWorkspace.name) private readonly workspaces: Model<SocialWorkspace>,
    private readonly conns: ConnectionsService,
    private readonly publisher: PublisherService,
  ) {}

  private brandOut(b: Record<string, any>) {
    return { id: b._id, ...strip(b) };
  }

  private async mustBrand(id: string) {
    const b = await this.brands.findById(id).lean();
    if (!b) throw new NotFoundException(`Brand "${id}" not found`);
    return b;
  }

  /* ---------- brands ---------- */
  async listBrands() {
    const [list, designs, posts] = await Promise.all([
      this.brands.find().sort({ order: 1 }).lean(),
      this.designs.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$brandId", n: { $sum: 1 } } }]),
      this.posts.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$brandId", n: { $sum: 1 } } }]),
    ]);
    const count = (a: { _id: string; n: number }[], id: string) => a.find((x) => x._id === id)?.n ?? 0;
    return list.map((b) => ({ ...this.brandOut(b), counts: { designs: count(designs, b._id), posts: count(posts, b._id) } }));
  }

  async getBrand(id: string) {
    return this.brandOut(await this.mustBrand(id));
  }

  async createBrand(dto: CreateBrandDto) {
    const { id, color, ...rest } = dto;
    const _id = id || "b" + newId();
    const col = color || "#6366f1";
    const order = await this.brands.countDocuments();
    const name = String(rest.name);
    const words = name.trim().split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
    // Same defaults as "Add brand" in the studio
    const doc = await this.brands.create({
      initials,
      handle: "", website: "", industry: "", tagline: "", about: "", audience: "", voice: "", dos: "", donts: "", hashtags: "", cta: "",
      lang: "English",
      defaultRatio: "4:5",
      colors: [["Primary", col], ["Dark", "#0B1220"], ["Light", "#F8FAFC"], ["Neutral", "#94A3B8"], ["Accent", shade(col, -0.28)]].map(([n, hex]) => ({ id: "c" + newId(), name: n, hex })),
      fonts: { heading: "Plus Jakarta Sans", body: "Inter", arabic: "Cairo" },
      ideas: [
        { t: "Announce " + name + " with a launch post", cat: "Announcement", p: 80, tpl: "launch" },
        { t: "Share a customer quote as a social proof post", cat: "Proof", p: 60, tpl: "testimonial" },
      ],
      ...editable(rest),
      _id,
      order,
    });
    return this.brandOut(doc.toObject());
  }

  async updateBrand(id: string, body: Record<string, unknown>) {
    const b = await this.brands.findByIdAndUpdate(id, { $set: editable(body) }, { new: true }).lean();
    if (!b) throw new NotFoundException(`Brand "${id}" not found`);
    return this.brandOut(b);
  }

  async deleteBrand(id: string) {
    await this.mustBrand(id);
    await Promise.all([
      this.brands.deleteOne({ _id: id }), this.designs.deleteMany({ brandId: id }), this.posts.deleteMany({ brandId: id }),
      this.conns.removeBrand([id]), this.publisher.removeBrand([id]),
    ]);
    const ws = await this.workspaces.findById(WORKSPACE_ID).lean();
    if (ws?.active === id) {
      const first = await this.brands.findOne().sort({ order: 1 }).lean();
      await this.workspaces.updateOne({ _id: WORKSPACE_ID }, { $set: { active: first?._id ?? "" } });
    }
    return { ok: true };
  }

  /* ---------- designs ---------- */
  async listDesigns(brandId: string, q?: string) {
    await this.mustBrand(brandId);
    const filter: Record<string, unknown> = { brandId };
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    return (await this.designs.find(filter).sort({ order: 1 }).lean()).map(strip);
  }

  async getDesign(brandId: string, id: string) {
    const d = await this.designs.findOne({ brandId, id }).lean();
    if (!d) throw new NotFoundException(`Design "${id}" not found`);
    return strip(d);
  }

  async createDesign(brandId: string, dto: CreateDesignDto) {
    await this.mustBrand(brandId);
    const item = { status: "Draft", source: "Template", upd: "Just now", ratio: "4:5", tpl: "blank", ...dto, id: dto.id || "d" + newId() };
    // New designs go first in the library, like in the studio
    await this.designs.updateMany({ brandId }, { $inc: { order: 1 } });
    const doc = await this.designs.create({ ...item, brandId, order: 0, hash: hashOf(item) });
    return strip(doc.toObject());
  }

  async updateDesign(brandId: string, id: string, body: Record<string, unknown>) {
    const d = await this.designs.findOneAndUpdate({ brandId, id }, { $set: { ...editable(body), hash: "" } }, { new: true }).lean();
    if (!d) throw new NotFoundException(`Design "${id}" not found`);
    return strip(d);
  }

  async deleteDesign(brandId: string, id: string) {
    const r = await this.designs.deleteOne({ brandId, id });
    if (!r.deletedCount) throw new NotFoundException(`Design "${id}" not found`);
    await this.posts.deleteMany({ brandId, d: id });
    return { ok: true };
  }

  /* ---------- posts ---------- */
  async listPosts(brandId: string, from?: string, to?: string, status?: string) {
    await this.mustBrand(brandId);
    const filter: Record<string, any> = { brandId };
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (status) filter.status = status;
    return (await this.posts.find(filter).sort({ date: 1, time: 1 }).lean()).map(strip);
  }

  async createPost(brandId: string, dto: CreatePostDto) {
    await this.mustBrand(brandId);
    if (!(await this.designs.exists({ brandId, id: dto.d }))) throw new NotFoundException(`Design "${dto.d}" not found`);
    const item = { status: "Scheduled", ...dto, id: dto.id || "p" + newId() };
    const order = await this.posts.countDocuments({ brandId });
    const doc = await this.posts.create({ ...item, brandId, order, hash: hashOf(item) });
    return strip(doc.toObject());
  }

  async updatePost(brandId: string, id: string, body: Record<string, unknown>) {
    const p = await this.posts.findOneAndUpdate({ brandId, id }, { $set: { ...editable(body), hash: "" } }, { new: true }).lean();
    if (!p) throw new NotFoundException(`Post "${id}" not found`);
    return strip(p);
  }

  async deletePost(brandId: string, id: string) {
    const r = await this.posts.deleteOne({ brandId, id });
    if (!r.deletedCount) throw new NotFoundException(`Post "${id}" not found`);
    return { ok: true };
  }
}
