import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, Res } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { Model, Types } from "mongoose";
import { reencode } from "../ai/hf";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { Media, MediaDocument } from "./media.schema";

export class CreateMediaDto {
  @IsString() @MaxLength(9_000_000) dataUrl: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
}

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
    const base = (process.env.PUBLIC_API_URL || `${r.protocol}://${r.get("host")}`).replace(/\/+$/, "");
    return { id: String(doc._id), url: `${base}/api/media/${doc._id}.webp`, width: out.width, height: out.height, bytes: out.buf.length };
  }

  /** Public (l'identifiant est aléatoire) : le site du blog doit pouvoir afficher la couverture */
  @Public() @Get(":id")
  async get(@Param("id") raw: string, @Res() res: any) {
    const id = raw.replace(/\.webp$/i, "");
    if (!Types.ObjectId.isValid(id) || id.length !== 24) throw new NotFoundException();
    const doc = await this.media.findById(id).select("+data");
    if (!doc) throw new NotFoundException();
    res.set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff" });
    res.send(doc.data);
  }
}
