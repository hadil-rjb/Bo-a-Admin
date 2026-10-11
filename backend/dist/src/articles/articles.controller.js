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
exports.ArticlesController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../common/roles.decorator");
const articles_service_1 = require("./articles.service");
const article_dto_1 = require("./dto/article.dto");
const actor = (r) => ({ id: r.user.sub, name: r.user.name });
let ArticlesController = class ArticlesController {
    s;
    constructor(s) {
        this.s = s;
    }
    // Routes statiques déclarées avant ":slug"
    list(q) { return this.s.list(q); }
    upcoming() { return this.s.upcoming(); }
    summary() { return this.s.summary(); }
    categories() { return this.s.categories(); }
    calendar(m) { return this.s.calendar(m); }
    get(slug) { return this.s.get(slug); }
    create(d, r) { return this.s.create(d, actor(r)); }
    update(slug, d, r) { return this.s.update(slug, d, actor(r)); }
    remove(slug, r) { return this.s.remove(slug, actor(r)); }
};
exports.ArticlesController = ArticlesController;
__decorate([
    (0, roles_decorator_1.AllowLink)(),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [article_dto_1.ListArticlesQuery]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "list", null);
__decorate([
    (0, roles_decorator_1.AllowLink)(),
    (0, common_1.Get)("upcoming"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "upcoming", null);
__decorate([
    (0, roles_decorator_1.AllowLink)(),
    (0, common_1.Get)("summary"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "summary", null);
__decorate([
    (0, roles_decorator_1.AllowLink)(),
    (0, common_1.Get)("categories"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "categories", null);
__decorate([
    (0, roles_decorator_1.AllowLink)(),
    (0, common_1.Get)("calendar/:month"),
    __param(0, (0, common_1.Param)("month")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "calendar", null);
__decorate([
    (0, roles_decorator_1.AllowLink)(),
    (0, common_1.Get)(":slug"),
    __param(0, (0, common_1.Param)("slug")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "get", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [article_dto_1.CreateArticleDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Patch)(":slug"),
    __param(0, (0, common_1.Param)("slug")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, article_dto_1.UpdateArticleDto, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "update", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Delete)(":slug"),
    __param(0, (0, common_1.Param)("slug")),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ArticlesController.prototype, "remove", null);
exports.ArticlesController = ArticlesController = __decorate([
    (0, common_1.Controller)("articles"),
    __metadata("design:paramtypes", [articles_service_1.ArticlesService])
], ArticlesController);
