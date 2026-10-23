import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { SocialDesign } from "./schemas/design.schema";
import { SocialDesignComment } from "./schemas/comment.schema";

type Actor = { id?: string | null; name?: string; role?: string };
export type NewComment = { text: string; parentId?: string; pageId?: string; layerId?: string; x?: number; y?: number; lx?: number; ly?: number };

/**
 * Comments on designs, in threads. Every signed-in member (viewers too) can comment, reply and resolve; only the author
 * edits a comment's text; the author or an admin deletes it (a thread goes with its first comment).
 */
@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(SocialDesign.name) private readonly designs: Model<SocialDesign>,
    @InjectModel(SocialDesignComment.name) private readonly comments: Model<SocialDesignComment>,
  ) {}

  private out(c: Record<string, any>) {
    return {
      id: String(c._id), parentId: c.parentId || null, pageId: c.pageId || null, layerId: c.layerId || null, x: c.x ?? null, y: c.y ?? null, lx: c.lx ?? null, ly: c.ly ?? null,
      text: c.text, authorId: c.authorId || null, authorName: c.authorName || "", resolved: !!c.resolved, resolvedByName: c.resolvedByName || "",
      edited: !!c.edited, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
  }
  private async find(brandId: string, designId: string, cid: string) {
    if (!Types.ObjectId.isValid(cid)) throw new NotFoundException("Comment not found");
    const c = await this.comments.findOne({ _id: cid, brandId, designId });
    if (!c) throw new NotFoundException("Comment not found");
    return c;
  }

  async list(brandId: string, designId: string) {
    return (await this.comments.find({ brandId, designId }).sort({ createdAt: 1 }).limit(2000).lean()).map((c) => this.out(c));
  }

  async create(brandId: string, designId: string, b: NewComment, by: Actor) {
    if (!by.id) throw new ForbiddenException("Sign in to comment");
    const text = String(b.text || "").trim().slice(0, 4000);
    if (!text) throw new BadRequestException("Write something first");
    if (!(await this.designs.exists({ brandId, id: designId }))) throw new NotFoundException(`Design "${designId}" not found`);
    let doc: Record<string, unknown>;
    if (b.parentId) { // a reply: in its thread
      const root = await this.find(brandId, designId, b.parentId);
      if (root.parentId) throw new BadRequestException("Reply to the thread's first comment");
      doc = { parentId: String(root._id) };
      if (root.resolved) await this.comments.updateOne({ _id: root._id }, { $set: { resolved: false, resolvedByName: "" } }); // a reply reopens it
    } else {
      if (!b.pageId || !Number.isFinite(b.x) || !Number.isFinite(b.y)) throw new BadRequestException("A new thread needs a slide and a point");
      const r1 = (v: number) => Math.round(v * 10) / 10, onLayer = !!b.layerId && Number.isFinite(b.lx) && Number.isFinite(b.ly);
      doc = { pageId: b.pageId, x: r1(b.x!), y: r1(b.y!), ...(onLayer ? { layerId: b.layerId, lx: r1(b.lx!), ly: r1(b.ly!) } : {}) };
    }
    const c = await this.comments.create({ ...doc, brandId, designId, text, authorId: by.id, authorName: by.name || "" });
    return this.out(c.toObject());
  }

  async update(brandId: string, designId: string, cid: string, b: { text?: string; resolved?: boolean }, by: Actor) {
    const c = await this.find(brandId, designId, cid);
    if (b.text !== undefined) {
      if (c.authorId !== by.id) throw new ForbiddenException("Only the author can edit this comment");
      const text = String(b.text).trim().slice(0, 4000); if (!text) throw new BadRequestException("Write something first");
      c.text = text; c.edited = true;
    }
    if (b.resolved !== undefined) {
      if (c.parentId) throw new BadRequestException("Resolve the thread, not a reply");
      c.resolved = !!b.resolved; c.resolvedByName = b.resolved ? by.name || "" : "";
    }
    await c.save();
    return this.out(c.toObject());
  }

  async remove(brandId: string, designId: string, cid: string, by: Actor) {
    const c = await this.find(brandId, designId, cid);
    if (c.authorId !== by.id && by.role !== "admin") throw new ForbiddenException("Only the author or an admin can delete this comment");
    await this.comments.deleteMany({ $or: [{ _id: c._id }, { parentId: String(c._id) }] });
    return { ok: true };
  }

  /** A deleted design or brand takes its comments with it */
  async removeFor(list: { brandId: string; id: string }[]) {
    if (list.length) await this.comments.deleteMany({ $or: list.map(({ brandId, id }) => ({ brandId, designId: id })) });
  }
  async removeBrands(brandIds: string[]) {
    if (brandIds.length) await this.comments.deleteMany({ brandId: { $in: brandIds } });
  }
}
