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
exports.FramerController = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const roles_decorator_1 = require("../common/roles.decorator");
const article_schema_1 = require("../articles/article.schema");
const framer_dto_1 = require("./dto/framer.dto");
const framer_service_1 = require("./framer.service");
const actor = (r) => ({ id: r.user.sub, name: r.user.name });
let FramerController = class FramerController {
    s;
    articles;
    constructor(s, articles) {
        this.s = s;
        this.articles = articles;
    }
    status() { return this.s.status(); }
    settings() { return this.s.view(); }
    save(r, d) { return this.s.update(d, actor(r)); }
    collections() { return this.s.collections(); }
    fields() { return this.s.fields(); }
    /** « Publish to Framer now » : envoie l'article tout de suite (passe en Live) */
    publish(slug, r) { return this.s.runFor(slug, actor(r)); }
    /** « Retry » : remet le compteur d'essais à zéro, le scheduler reprend l'article */
    async retry(slug) {
        await this.articles.updateOne({ slug }, { $set: { framerTries: 0, framerState: "", framerNote: "" }, $unset: { framerNextTry: 1, framerLock: 1 } });
        return { ok: true };
    }
};
exports.FramerController = FramerController;
__decorate([
    (0, common_1.Get)("status"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FramerController.prototype, "status", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Get)("settings"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FramerController.prototype, "settings", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Put)("settings"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, framer_dto_1.UpdateFramerSettingsDto]),
    __metadata("design:returntype", void 0)
], FramerController.prototype, "save", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Get)("collections"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FramerController.prototype, "collections", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Get)("fields"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FramerController.prototype, "fields", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("publish/:slug"),
    __param(0, (0, common_1.Param)("slug")),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FramerController.prototype, "publish", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("retry/:slug"),
    __param(0, (0, common_1.Param)("slug")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FramerController.prototype, "retry", null);
exports.FramerController = FramerController = __decorate([
    (0, common_1.Controller)("framer"),
    __param(1, (0, mongoose_1.InjectModel)(article_schema_1.Article.name)),
    __metadata("design:paramtypes", [framer_service_1.FramerService, mongoose_2.Model])
], FramerController);
