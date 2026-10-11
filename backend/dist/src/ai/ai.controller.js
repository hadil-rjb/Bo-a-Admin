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
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../common/roles.decorator");
const ai_service_1 = require("./ai.service");
const cover_image_service_1 = require("./cover-image.service");
const ai_dto_1 = require("./dto/ai.dto");
const actor = (r) => ({ id: r.user.sub, name: r.user.name });
let AiController = class AiController {
    s;
    img;
    constructor(s, img) {
        this.s = s;
        this.img = img;
    }
    settings() { return this.s.view(); }
    save(r, d) { return this.s.update(d, actor(r)); }
    models(p) { return this.s.models(p === "groq" ? "groq" : "anthropic"); }
    ideas() { return this.s.listIdeas(); }
    generate(r, d) { return this.s.generateIdeas(d, actor(r)); }
    article(r, id, d) { return this.s.generateArticle(id, d.date || undefined, actor(r)); }
    imageModels() { return this.s.imageModels(); }
    coverImage(r, d) { return this.img.generate(d, actor(r)); }
    analyzeCover() { return this.s.analyzeCoverStyle(); }
    cover(r, d) { return this.s.coverPrompt(d, actor(r)); }
    dismiss(id) { return this.s.dismiss(id); }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Get)("settings"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "settings", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Put)("settings"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ai_dto_1.UpdateAiSettingsDto]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "save", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Get)("models"),
    __param(0, (0, common_1.Query)("provider")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "models", null);
__decorate([
    (0, common_1.Get)("ideas"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "ideas", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("ideas/generate"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ai_dto_1.GenerateIdeasDto]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "generate", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("ideas/:id/article"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, ai_dto_1.GenerateArticleDto]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "article", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Get)("image-models"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "imageModels", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("cover-image"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ai_dto_1.CoverImageDto]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "coverImage", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Post)("cover-style/analyze"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "analyzeCover", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("cover-prompt"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ai_dto_1.CoverPromptDto]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "cover", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Delete)("ideas/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "dismiss", null);
exports.AiController = AiController = __decorate([
    (0, common_1.Controller)("ai"),
    __metadata("design:paramtypes", [ai_service_1.AiService, cover_image_service_1.CoverImageService])
], AiController);
