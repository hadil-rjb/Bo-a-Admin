import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { AnyBulkWriteOperation, Model } from "mongoose";
import { BrandUpsert, WorkspaceDeltaDto, WorkspaceDto } from "./dto/workspace.dto";
import { SocialBrand } from "./schemas/brand.schema";
import { SocialDesign } from "./schemas/design.schema";
import { SocialPost } from "./schemas/post.schema";
import { SocialWorkspace, WORKSPACE_ID } from "./schemas/workspace.schema";
import { hashOf, strip } from "./social.util";
import { mergePost } from "./publishing/post-state";
import { ConnectionsService } from "./publishing/connections.service";
import { PublisherService } from "./publishing/publisher.service";

type Item = Record<string, any> & { id: string };

/**
 * Maps the studio's in-memory snapshot ({ brands, data, active, set }) onto
 * normalized collections: brands, designs, posts and workspaces.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(SocialBrand.name) private readonly brands: Model<SocialBrand>,
    @InjectModel(SocialDesign.name) private readonly designs: Model<SocialDesign>,
    @InjectModel(SocialPost.name) private readonly posts: Model<SocialPost>,
    @InjectModel(SocialWorkspace.name) private readonly workspaces: Model<SocialWorkspace>,
    private readonly conns: ConnectionsService,
    private readonly publisher: PublisherService,
  ) {}

  /** Rebuilds the snapshot the client expects, or null when nothing was saved yet. */
  async get(): Promise<WorkspaceDto | null> {
    const ws = await this.workspaces.findById(WORKSPACE_ID).lean();
    const [brands, designs, posts] = await Promise.all([
      this.brands.find().sort({ order: 1 }).lean(),
      this.designs.find().sort({ order: 1 }).lean(),
      this.posts.find().sort({ order: 1 }).lean(),
    ]);
    if (!brands.length) return null;

    const data: WorkspaceDto["data"] = {};
    const kits = brands.map((b) => {
      const { platforms, ideas, articles, extraData, ...kit } = b as Record<string, any>;
      data[b._id] = { designs: [], posts: [], platforms: platforms || {}, ideas: ideas || [], articles: articles || [], ...(extraData || {}) };
      return { id: b._id, ...strip(kit) };
    });
    designs.forEach((d) => data[d.brandId]?.designs.push(strip(d)));
    posts.forEach((p) => data[p.brandId]?.posts.push(strip(p)));

    const active = ws && kits.some((b) => b.id === ws.active) ? ws.active : kits[0].id;
    return { brands: kits, data, active, ...(ws?.set ? { set: ws.set } : {}) };
  }

  private brandDoc({ id, kit, content }: BrandUpsert, order: number) {
    const { id: _id, ...fields } = kit;
    const { designs, posts, platforms = {}, ideas = [], articles = [], ...extraData } = content || {};
    return { ...fields, _id: String(id), order, platforms, ideas, articles, extraData } as any;
  }

  /**
   * Replaces the whole workspace with a snapshot (e.g. restoring an "Export JSON" backup).
   * Unchanged designs/posts are skipped using a content hash.
   */
  async replace(dto: WorkspaceDto) {
    const brandIds = dto.brands.map((b) => String(b.id));

    await this.brands.bulkWrite(
      dto.brands.map(
        (b, order): AnyBulkWriteOperation => ({
          replaceOne: { filter: { _id: String(b.id) }, replacement: this.brandDoc({ id: b.id, kit: b, content: dto.data[b.id] }, order), upsert: true },
        }),
      ),
      { ordered: false },
    );
    const gone = (await this.brands.find({ _id: { $nin: brandIds } }, { _id: 1 }).lean()).map((b) => String(b._id));
    await Promise.all([
      this.brands.deleteMany({ _id: { $nin: brandIds } }),
      this.designs.deleteMany({ brandId: { $nin: brandIds } }),
      this.posts.deleteMany({ brandId: { $nin: brandIds } }),
      this.conns.removeBrand(gone),
      this.publisher.removeBrand(gone),
    ]);

    for (const id of brandIds) {
      const d = dto.data[id] || {};
      await Promise.all([this.syncItems(this.designs, id, d.designs || []), this.syncItems(this.posts, id, d.posts || [])]);
    }

    const ws = await this.workspaces.findByIdAndUpdate(
      WORKSPACE_ID,
      { $set: { active: dto.active || brandIds[0], set: dto.set ?? {} } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { ok: true, updatedAt: (ws as any)?.updatedAt };
  }

  /**
   * Applies the studio's incremental sync. Only items listed are written; only items the
   * client explicitly deleted are removed, so concurrent tabs / API clients don't clobber
   * each other (last write wins per brand, design or post).
   */
  async applyDelta(dto: WorkspaceDeltaDto) {
    const del = dto.deleted || {};
    if (del.brands?.length) {
      const ids = del.brands;
      await Promise.all([
        this.brands.deleteMany({ _id: { $in: ids } }),
        this.designs.deleteMany({ brandId: { $in: ids } }),
        this.posts.deleteMany({ brandId: { $in: ids } }),
        this.conns.removeBrand(ids),
        this.publisher.removeBrand(ids),
      ]);
    }

    if (dto.brands?.length) {
      const existing = new Map((await this.brands.find({}, { order: 1 }).lean()).map((b) => [b._id, b.order]));
      let next = existing.size;
      const orderOf = (id: string) => {
        const i = dto.brandOrder?.indexOf(id) ?? -1;
        return i >= 0 ? i : existing.get(id) ?? next++;
      };
      await this.brands.bulkWrite(
        dto.brands.map((b): AnyBulkWriteOperation => ({
          replaceOne: { filter: { _id: b.id }, replacement: this.brandDoc(b, orderOf(b.id)), upsert: true },
        })),
        { ordered: false },
      );
    }
    if (dto.brandOrder?.length) {
      await this.brands.bulkWrite(dto.brandOrder.map((id, order) => ({ updateOne: { filter: { _id: id }, update: { $set: { order } } } })));
    }

    await this.applyItems(this.designs, dto.designs, dto.designOrder, del.designs);
    await this.applyItems(this.posts, dto.posts, dto.postOrder, del.posts);

    const $set: Record<string, unknown> = {};
    if (dto.active !== undefined) $set.active = dto.active;
    if (dto.set !== undefined) $set.set = dto.set;
    if (Object.keys($set).length) await this.workspaces.updateOne({ _id: WORKSPACE_ID }, { $set }, { upsert: true });
    return { ok: true };
  }

  private async applyItems(
    model: Model<any>,
    upserts: { brandId: string; item: Item }[] = [],
    order: Record<string, string[]> = {},
    deleted: { brandId: string; id: string }[] = [],
  ) {
    const pos = (brandId: string, id: string) => order[brandId]?.indexOf(id) ?? -1;
    const list = upserts.filter((u) => u.item && u.item.id);
    const owned = await this.serverOwned(model, list);
    const ops: AnyBulkWriteOperation[] = list.map(({ brandId, item }) => {
      const i = pos(brandId, item.id), doc = owned ? mergePost(owned.get(`${brandId}|${item.id}`), item) : item;
      return {
        replaceOne: {
          filter: { brandId, id: item.id },
          replacement: { ...doc, brandId, order: i >= 0 ? i : Number.MAX_SAFE_INTEGER, hash: hashOf(item) },
          upsert: true,
        },
      };
    });
    Object.entries(order).forEach(([brandId, ids]) =>
      ids.forEach((id, i) => ops.push({ updateOne: { filter: { brandId, id }, update: { $set: { order: i } } } })),
    );
    if (ops.length) await model.bulkWrite(ops, { ordered: true });
    if (deleted.length) await model.deleteMany({ $or: deleted.map(({ brandId, id }) => ({ brandId, id })) });
  }

  /** Posts carry fields only the publisher writes (publish, media): load them so upserts keep them. */
  private async serverOwned(model: Model<any>, list: { brandId: string; item: Item }[]) {
    if (model !== (this.posts as Model<any>) || !list.length) return null;
    const rows = await model.find({ $or: list.map(({ brandId, item }) => ({ brandId, id: item.id })) }).select("brandId id status date time publish media").lean<Record<string, any>[]>();
    return new Map(rows.map((r) => [`${r.brandId}|${r.id}`, r]));
  }

  private async syncItems(model: Model<any>, brandId: string, items: Item[]) {
    const list = items.filter((i) => i && i.id);
    const existing = new Map(
      (await model.find({ brandId }, { id: 1, hash: 1, order: 1 }).lean<{ id: string; hash?: string; order: number }[]>()).map((e) => [e.id, e]),
    );
    const ops: AnyBulkWriteOperation[] = [];
    const owned = await this.serverOwned(model, list.map((item) => ({ brandId, item })));
    list.forEach((item, order) => {
      const hash = hashOf(item);
      const prev = existing.get(item.id);
      if (prev && prev.hash === hash && prev.order === order) return;
      const doc = owned ? mergePost(owned.get(`${brandId}|${item.id}`), item) : item;
      ops.push({ replaceOne: { filter: { brandId, id: item.id }, replacement: { ...doc, brandId, order, hash }, upsert: true } });
    });
    if (ops.length) await model.bulkWrite(ops, { ordered: false });
    await model.deleteMany({ brandId, id: { $nin: list.map((i) => i.id) } });
  }

  /** Wipes everything; the client seeds the demo workspace again on next load. */
  async reset() {
    await Promise.all([this.brands.deleteMany({}), this.designs.deleteMany({}), this.posts.deleteMany({}), this.workspaces.deleteMany({})]);
    return { ok: true };
  }

  async getSettings() {
    const ws = await this.workspaces.findById(WORKSPACE_ID).lean();
    return { active: ws?.active ?? null, set: ws?.set ?? {} };
  }

  async patchSettings(body: { active?: string; set?: Record<string, unknown> }) {
    const $set: Record<string, unknown> = {};
    if (typeof body.active === "string") $set.active = body.active;
    Object.entries(body.set || {}).forEach(([k, v]) => ($set["set." + k] = v));
    await this.workspaces.updateOne({ _id: WORKSPACE_ID }, { $set }, { upsert: true });
    return this.getSettings();
  }
}
