import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomBytes, timingSafeEqual } from "crypto";
import * as bcrypt from "bcryptjs";
import { User, UserDocument } from "../auth/user.schema";
import { Article, ArticleDocument } from "../articles/article.schema";
import { ShareSettings, ShareSettingsDocument } from "./share-settings.schema";
import { Actor, ActivityService } from "./activity.service";
import { InviteDto, LinkDto } from "./dto/share.dto";

const ONLINE_MS = 45_000;
const newToken = () => randomBytes(24).toString("base64url");
const tempPassword = () => randomBytes(9).toString("base64url").replace(/[-_]/g, "x") + "Aa1"; // respecte la règle 8+/maj/min/chiffre
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const RN: Record<string, string> = { admin: "Owner", editor: "Editor", viewer: "Viewer" };

@Injectable()
export class ShareService {
  /** Présence en mémoire (instance unique) : clé = id utilisateur ou "link:<visiteur>" */
  private presence = new Map<string, { id: string; name: string; link: boolean; at: number }>();
  private seen = new Map<string, number>();
  private opened = new Map<string, number>();

  constructor(
    @InjectModel(User.name) private users: Model<UserDocument>,
    @InjectModel(Article.name) private articles: Model<ArticleDocument>,
    @InjectModel(ShareSettings.name) private settings: Model<ShareSettingsDocument>,
    private act: ActivityService,
  ) {}

  private async cfg() {
    return (await this.settings.findOne()) ?? (await this.settings.create({ linkEnabled: false, linkToken: newToken() }));
  }
  userById(id: string) { return this.users.findById(id).select("name email role").lean(); }
  async checkLink(token: string) { const c = await this.cfg(); return c.linkEnabled && same(c.linkToken, token); }
  private online(id: string) { const p = this.presence.get(id); return !!p && Date.now() - p.at < ONLINE_MS; }

  async state(me: { sub: string; role: string }) {
    const [c, us] = await Promise.all([this.cfg(), this.users.find().select("name email role avatar lastActiveAt createdAt").sort({ createdAt: 1 }).lean()]);
    return {
      me: { id: me.sub, role: me.role },
      members: us.map((u: any) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, avatar: u.avatar || "", lastActiveAt: u.lastActiveAt ?? null, online: this.online(String(u._id)) })),
      link: { enabled: c.linkEnabled, token: me.role === "admin" ? c.linkToken : undefined },
    };
  }

  async invite(actor: Actor, dto: InviteDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.users.exists({ email })) throw new ConflictException("Cette personne a déjà accès");
    const password = tempPassword();
    const u = await this.users.create({ email, name: dto.name.trim(), role: dto.role, passwordHash: await bcrypt.hash(password, 12) });
    await this.act.record({ kind: "share", action: "invite", actorId: actor.id ?? undefined, actorName: actor.name, target: `${u.name} (${RN[dto.role]})` });
    return { member: { id: u.id, name: u.name, email: u.email, role: u.role }, tempPassword: password };
  }

  private async target(actor: Actor, id: string) {
    const u = await this.users.findById(id);
    if (!u) throw new NotFoundException("Utilisateur introuvable");
    if (u.role === "admin") throw new BadRequestException("Le propriétaire ne peut pas être modifié");
    if (actor.id === id) throw new BadRequestException("Vous ne pouvez pas modifier votre propre accès");
    return u;
  }

  async setRole(actor: Actor, id: string, role: "editor" | "viewer") {
    const u = await this.target(actor, id);
    u.role = role; await u.save();
    await this.act.record({ kind: "share", action: "role", actorId: actor.id ?? undefined, actorName: actor.name, target: `${u.name} → ${RN[role]}` });
    return { ok: true };
  }

  async remove(actor: Actor, id: string) {
    const u = await this.target(actor, id);
    await u.deleteOne(); this.presence.delete(id);
    await this.act.record({ kind: "share", action: "remove", actorId: actor.id ?? undefined, actorName: actor.name, target: u.name });
    return { ok: true };
  }

  async setLink(actor: Actor, dto: LinkDto) {
    const c = await this.cfg();
    if (dto.regenerate) {
      c.linkToken = newToken(); await c.save();
      await this.act.record({ kind: "share", action: "reset", actorId: actor.id ?? undefined, actorName: actor.name, target: "" });
    }
    if (typeof dto.enabled === "boolean" && dto.enabled !== c.linkEnabled) {
      c.linkEnabled = dto.enabled; await c.save();
      await this.act.record({ kind: "share", action: "link", actorId: actor.id ?? undefined, actorName: actor.name, target: dto.enabled ? "on" : "off" });
    }
    return { enabled: c.linkEnabled, token: c.linkToken };
  }

  /** Heartbeat : présence en direct + dernière activité + journal « ouvert par » (1 entrée / 30 min / personne) */
  async ping(user: { sub: string | null; role: string; name: string }, viewerId?: string) {
    const link = user.role === "link";
    const key = link ? "link:" + (String(viewerId ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || "anon") : String(user.sub);
    const name = link ? "Guest (link)" : user.name;
    const now = Date.now();
    this.presence.set(key, { id: key, name, link, at: now });
    for (const [k, v] of this.presence) if (now - v.at > 300_000) this.presence.delete(k);
    if (!link && now - (this.seen.get(key) ?? 0) > 60_000) { this.seen.set(key, now); await this.users.updateOne({ _id: key }, { lastActiveAt: new Date(now) }); }
    if (now - (this.opened.get(key) ?? 0) > 30 * 60_000) {
      this.opened.set(key, now);
      await this.act.record({ kind: "open", action: link ? "open-link" : "open", actorId: link ? undefined : key, actorName: name });
    }
    return { viewers: [...this.presence.values()].filter(v => now - v.at < ONLINE_MS).map(v => ({ id: v.id, name: v.name, link: v.link, you: v.id === key })) };
  }

  /** Restaure une version : annule une modification ou recrée un article supprimé */
  async restore(actor: Actor, id: string) {
    const a = await this.act.get(id);
    if (!a || a.kind !== "article" || !a.restorable || a.restoredAt || !a.before) throw new BadRequestException("Cette version ne peut pas être restaurée");
    try {
      if (a.action === "update") {
        const r = await this.articles.findOneAndUpdate({ slug: a.slug }, { $set: a.before }, { new: true }).lean();
        if (!r) throw new NotFoundException("L'article n'existe plus");
      } else if (a.action === "delete") {
        await this.articles.create(a.before);
      } else throw new BadRequestException("Cette version ne peut pas être restaurée");
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException("Un article avec ce slug existe déjà");
      throw e;
    }
    await this.act.markRestored(id);
    await this.act.record({ kind: "article", action: "restore", actorId: actor.id ?? undefined, actorName: actor.name, target: a.target, slug: (a.before.slug as string) ?? a.slug });
    return { ok: true };
  }
}
