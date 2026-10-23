import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, Res } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { createHash } from "crypto";
import { Model, Types } from "mongoose";
import sharp from "sharp";
import { reencode } from "../ai/hf";
import { sniff } from "../ai/image";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { Media, MediaDocument } from "./media.schema";
import { publicApiBase } from "../common/public-url";

export class CreateMediaDto {
  @IsString() @MaxLength(9_000_000) dataUrl: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
}

export class CreateAssetDto {
  @IsString() @MaxLength(17_000_000) dataUrl: string;
}

/** Largest studio image kept (bytes): a Mongo document holds 16 MB */
const ASSET_MAX = 12 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

@Controller("media")
export class MediaController {
  constructor(@InjectModel(Media.name) private media: Model<MediaDocument>) {}

  /** Enregistre une couverture choisie et renvoie son URL publique */
  @Roles("admin", "editor") @Post("cover")
  async create(@Req() r: any, @Body() d: CreateMediaDto) {
    const m = /^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(d.dataUrl);
    if (!m) throw new BadRequestException("Expected a PNG, JPEG or WebP data URL");
    const out = await reencode(Buffer.from(m[1], "base64"));
    const doc = await this.media.create({ data: out.buf, mime: "image/webp", size: out.buf.length, width: out.width, height: out.height, model: d.model ?? "", createdBy: r.user.sub });
    const base = publicApiBase(process.env.PUBLIC_API_URL, `${r.protocol}://${r.get("host")}`);
    return { id: String(doc._id), url: `${base}/media/${doc._id}.webp`, width: out.width, height: out.height, bytes: out.buf.length };
  }

  /**
   * Studio design image (upload, adjusted image, import): stored as sent, so the canvas and exports keep
   * full quality. Identical bytes are stored once; the design keeps only the returned URL.
   */
  @Roles("admin", "editor") @Post("assets")
  async asset(@Req() r: any, @Body() d: CreateAssetDto) {
    const m = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(d.dataUrl);
    if (!m) throw new BadRequestException("Expected an image data URL");
    const buf = Buffer.from(m[1], "base64"), mime = sniff(buf);
    if (!mime) throw new BadRequestException("This is not a PNG, JPEG, WebP or GIF image");
    if (buf.length > ASSET_MAX) throw new BadRequestException("This image is larger than 12 MB");
    const sha = createHash("sha256").update(buf).digest("hex");
    let doc = await this.media.findOne({ kind: "asset", sha });
    if (!doc) {
      const meta = await sharp(buf, { failOn: "none" }).metadata().catch(() => ({ width: 0, height: 0 }));
      doc = await this.media.create({ data: buf, mime, size: buf.length, width: meta.width ?? 0, height: meta.height ?? 0, kind: "asset", sha, createdBy: r.user.sub });
    }
    const base = publicApiBase(process.env.PUBLIC_API_URL, `${r.protocol}://${r.get("host")}`);
    return { id: String(doc._id), url: `${base}/media/${doc._id}.${EXT[doc.mime] || "bin"}`, width: doc.width, height: doc.height, bytes: doc.size };
  }

  /** Public (l'identifiant est aléatoire) : le site du blog doit pouvoir afficher la couverture */
  @Public() @Get(":id")
  async get(@Param("id") raw: string, @Res() res: any) {
    const id = raw.replace(/\.(webp|png|jpe?g|gif|bin)$/i, "");
    if (!Types.ObjectId.isValid(id) || id.length !== 24) throw new NotFoundException();
    const doc = await this.media.findById(id).select("+data");
    if (!doc) throw new NotFoundException();
    // Any origin may read the pixels: the studio draws its images on a canvas (image adjustments, export)
    res.set({ "Content-Type": doc.mime || "image/webp", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff" });
    res.send(doc.data);
  }
}
