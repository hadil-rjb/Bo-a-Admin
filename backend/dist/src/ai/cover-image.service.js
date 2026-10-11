"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoverImageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const inference_1 = require("@huggingface/inference");
const mongoose_2 = require("mongoose");
const crypto_1 = require("../common/crypto");
const ai_settings_schema_1 = require("./ai-settings.schema");
const cover_profile_1 = require("./cover-profile");
const hf_1 = require("./hf");
const HOURLY_LIMIT = 20;
let CoverImageService = class CoverImageService {
    settings;
    /** Remplaçables dans les tests */
    makeClient = (token) => new inference_1.InferenceClient(token);
    sleep = (ms) => new Promise(r => setTimeout(r, ms));
    hits = new Map();
    busy = new Set();
    secret;
    constructor(settings, cfg) {
        this.settings = settings;
        this.secret = cfg.getOrThrow("JWT_SECRET");
    }
    async generate(dto, actor) {
        const uid = actor.id ?? "x", now = Date.now(), h = (this.hits.get(uid) ?? []).filter(t => now - t < 3_600_000);
        if (h.length >= HOURLY_LIMIT)
            throw new common_1.HttpException("Hourly image generation limit reached — try again later", 429);
        if (this.busy.has(uid))
            throw new common_1.ConflictException("An image is already being generated");
        this.busy.add(uid); // verrou posé AVANT tout await : un double clic ne lance pas deux générations
        try {
            const s = await this.settings.findOne().select("+hfKey");
            let token = null;
            try {
                token = s?.hfKey ? (0, crypto_1.decrypt)(s.hfKey, this.secret) : null;
            }
            catch {
                token = null;
            }
            if (!s || !token)
                throw new common_1.BadRequestException("Add your Hugging Face token in Settings → Cover images first");
            const parts = (0, hf_1.splitCoverPrompt)(dto.prompt);
            if (parts.subject.length < 20)
                throw new common_1.BadRequestException("The cover prompt is too short");
            const profile = s.coverProfile, ratio = dto.ratio ?? parts.ratio ?? profile?.ratio ?? "16:9";
            const prompt = (0, hf_1.composePrompt)(parts.subject, s.imageKeywords, profile?.palette);
            const negative = [parts.avoid, s.imageNegative].filter(Boolean).join(", ");
            h.push(now);
            this.hits.set(uid, h); // seuls les appels réellement envoyés comptent dans la limite
            const out = await (0, hf_1.generateCover)(this.makeClient(token), { model: s.hfModel, prompt, negative, ratio, seed: dto.seed, sleep: this.sleep, signal: AbortSignal.timeout(150_000) });
            const match = await (0, cover_profile_1.paletteMatch)(profile?.palette ?? [], out.buf).catch(() => null);
            return { image: `data:image/webp;base64,${out.buf.toString("base64")}`, width: out.width, height: out.height, bytes: out.buf.length, model: out.model, seed: out.seed, ratio, match, prompt };
        }
        finally {
            this.busy.delete(uid);
        }
    }
};
exports.CoverImageService = CoverImageService;
exports.CoverImageService = CoverImageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(ai_settings_schema_1.AiSettings.name)),
    __metadata("design:paramtypes", [mongoose_2.Model, config_1.ConfigService])
], CoverImageService);
