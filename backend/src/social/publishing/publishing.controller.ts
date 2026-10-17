import { Body, Controller, Delete, Get, Param, Post, Put, Query, Redirect, Req, Res } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString } from "class-validator";
import { Public } from "../../common/public.decorator";
import { Roles } from "../../common/roles.decorator";
import { ConnectionsService } from "./connections.service";
import { PublisherService } from "./publisher.service";

const EDIT = ["admin", "editor"];

export class PostMediaDto {
  /** Slides rendered by the studio, as PNG/JPEG data URLs */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) images?: string[];
  /** Content hash of the design pages the images were rendered from */
  @IsOptional() @IsString() hash?: string;
  /** The post itself, so it exists on the server before the debounced sync */
  @IsOptional() @IsObject() post?: Record<string, any>;
}

export class TokenConnectDto {
  @IsOptional() @IsString() botToken?: string;
  @IsOptional() @IsString() chat?: string;
}

/** Connected accounts (Settings → Connected accounts) and publishing. */
@Controller("social")
export class PublishingController {
  constructor(private conns: ConnectionsService, private publisher: PublisherService) {}

  /* ---------- connected accounts ---------- */
  @Get("brands/:brandId/connections")
  list(@Param("brandId") brandId: string) { return this.conns.list(brandId); }

  @Roles(...EDIT) @Get("brands/:brandId/connections/:net/auth-url")
  authUrl(@Param("brandId") brandId: string, @Param("net") net: string, @Req() r: any) { return this.conns.authUrl(brandId, net, r.user.sub); }

  @Roles(...EDIT) @Post("brands/:brandId/connections/:net")
  connect(@Param("brandId") brandId: string, @Param("net") net: string, @Body() d: TokenConnectDto, @Req() r: any) {
    return this.conns.connectWithToken(brandId, net, { botToken: d.botToken ?? "", chat: d.chat ?? "" }, r.user.sub);
  }

  @Roles(...EDIT) @Delete("brands/:brandId/connections/:net")
  disconnect(@Param("brandId") brandId: string, @Param("net") net: string) { return this.conns.disconnect(brandId, net); }

  /** The network's redirect after sign-in (browser, no Authorization header): protected by `state`. */
  @Public() @Get("connections/callback/:net") @Redirect()
  async callback(@Param("net") net: string, @Query() q: Record<string, string>) {
    return { url: await this.conns.callback(net, q) };
  }

  /* ---------- publishing ---------- */
  @Roles(...EDIT) @Put("brands/:brandId/posts/:id/media")
  media(@Param("brandId") brandId: string, @Param("id") id: string, @Body() d: PostMediaDto) {
    return this.publisher.saveMedia(brandId, id, { images: d.images ?? [], hash: d.hash, post: d.post });
  }

  /** Publish now (optionally sending the post and its rendered slides in the same request). */
  @Roles(...EDIT) @Post("brands/:brandId/posts/:id/publish")
  async publish(@Param("brandId") brandId: string, @Param("id") id: string, @Body() d: PostMediaDto) {
    if (d.images?.length) await this.publisher.saveMedia(brandId, id, { images: d.images, hash: d.hash, post: d.post });
    else if (d.post) await this.publisher.upsertPost(brandId, { ...d.post, id });
    return this.publisher.publish(brandId, id, { manual: true });
  }

  @Get("brands/:brandId/publish-state")
  states(@Param("brandId") brandId: string) { return this.publisher.states(brandId); }

  /** Published images. Public (random ids): Instagram and TikTok download them from here. */
  @Public() @Get("media/:file")
  async file(@Param("file") file: string, @Res() res: any) {
    const m = await this.publisher.file(file);
    res.set({ "Content-Type": m.mime, "Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff" });
    res.send(m.data);
  }
}
