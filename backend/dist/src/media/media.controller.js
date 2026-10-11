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
exports.MediaController = exports.CreateMediaDto = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const class_validator_1 = require("class-validator");
const mongoose_2 = require("mongoose");
const hf_1 = require("../ai/hf");
const public_decorator_1 = require("../common/public.decorator");
const roles_decorator_1 = require("../common/roles.decorator");
const media_schema_1 = require("./media.schema");
class CreateMediaDto {
    dataUrl;
    model;
}
exports.CreateMediaDto = CreateMediaDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(9_000_000),
    __metadata("design:type", String)
], CreateMediaDto.prototype, "dataUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateMediaDto.prototype, "model", void 0);
let MediaController = class MediaController {
    media;
    constructor(media) {
        this.media = media;
    }
    /** Enregistre une couverture choisie et renvoie son URL publique */
    async create(r, d) {
        const m = /^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(d.dataUrl);
        if (!m)
            throw new common_1.BadRequestException("Expected a PNG, JPEG or WebP data URL");
        const out = await (0, hf_1.reencode)(Buffer.from(m[1], "base64"));
        const doc = await this.media.create({ data: out.buf, mime: "image/webp", size: out.buf.length, width: out.width, height: out.height, model: d.model ?? "", createdBy: r.user.sub });
        const base = (process.env.PUBLIC_API_URL ?? `${r.protocol}://${r.get("host")}`).replace(/\/+$/, "");
        return { id: String(doc._id), url: `${base}/api/media/${doc._id}.webp`, width: out.width, height: out.height, bytes: out.buf.length };
    }
    /** Public (l'identifiant est aléatoire) : le site du blog doit pouvoir afficher la couverture */
    async get(raw, res) {
        const id = raw.replace(/\.webp$/i, "");
        if (!mongoose_2.Types.ObjectId.isValid(id) || id.length !== 24)
            throw new common_1.NotFoundException();
        const doc = await this.media.findById(id).select("+data");
        if (!doc)
            throw new common_1.NotFoundException();
        res.set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff" });
        res.send(doc.data);
    }
};
exports.MediaController = MediaController;
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("cover"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateMediaDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "create", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "get", null);
exports.MediaController = MediaController = __decorate([
    (0, common_1.Controller)("media"),
    __param(0, (0, mongoose_1.InjectModel)(media_schema_1.Media.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], MediaController);
