import { BadRequestException, ConflictException, HttpException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { InferenceClient } from "@huggingface/inference";
import { Model } from "mongoose";
import { decrypt } from "../common/crypto";
import { Actor } from "../share/activity.service";
import { AiSettings, AiSettingsDocument } from "./ai-settings.schema";
import { paletteMatch } from "./cover-profile";
import { CoverImageDto } from "./dto/ai.dto";
import { composePrompt, generateCover, HfLike, splitCoverPrompt } from "./hf";

const HOURLY_LIMIT = 20;

@Injectable()
export class CoverImageService {
  /** Remplaçables dans les tests */
  makeClient = (token: string): HfLike => new InferenceClient(token) as unknown as HfLike;
  sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  private hits = new Map<string, number[]>();
  private busy = new Set<string>();
  private secret: string;

  constructor(@InjectModel(AiSettings.name) private settings: Model<AiSettingsDocument>, cfg: ConfigService) { this.secret = cfg.getOrThrow<string>("JWT_SECRET"); }

  async generate(dto: CoverImageDto, actor: Actor) {
    const uid = actor.id ?? "x", now = Date.now(), h = (this.hits.get(uid) ?? []).filter(t => now - t < 3_600_000);
    if (h.length >= HOURLY_LIMIT) throw new HttpException("Hourly image generation limit reached — try again later", 429);
    if (this.busy.has(uid)) throw new ConflictException("An image is already being generated");
    this.busy.add(uid); // verrou posé AVANT tout await : un double clic ne lance pas deux générations
    try {
      const s = await this.settings.findOne().select("+hfKey");
      let token: string | null = null;
      try { token = s?.hfKey ? decrypt(s.hfKey, this.secret) : null; } catch { token = null; }
      if (!s || !token) throw new BadRequestException("Add your Hugging Face token in Settings → Cover images first");

      const parts = splitCoverPrompt(dto.prompt);
      if (parts.subject.length < 20) throw new BadRequestException("The cover prompt is too short");
      const profile = s.coverProfile, ratio = dto.ratio ?? parts.ratio ?? profile?.ratio ?? "16:9";
      const prompt = composePrompt(parts.subject, s.imageKeywords, profile?.palette);
      const negative = [parts.avoid, s.imageNegative].filter(Boolean).join(", ");

      h.push(now); this.hits.set(uid, h); // seuls les appels réellement envoyés comptent dans la limite
      const out = await generateCover(this.makeClient(token), { model: s.hfModel, prompt, negative, ratio, seed: dto.seed, sleep: this.sleep, signal: AbortSignal.timeout(150_000) });
      const match = await paletteMatch(profile?.palette ?? [], out.buf).catch(() => null);
      return { image: `data:image/webp;base64,${out.buf.toString("base64")}`, width: out.width, height: out.height, bytes: out.buf.length, model: out.model, seed: out.seed, ratio, match, prompt };
    } finally { this.busy.delete(uid); }
  }
}
