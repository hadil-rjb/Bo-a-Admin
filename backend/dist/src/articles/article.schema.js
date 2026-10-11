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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArticleSchema = exports.Article = exports.STATUSES = void 0;
const mongoose_1 = require("@nestjs/mongoose");
exports.STATUSES = ["Live", "Scheduled", "Draft"];
let Article = class Article {
    slug;
    img; // URL ou data URL (cover)
    alt;
    coverPrompt; // prompt pour générer l'image de couverture
    title;
    meta; // meta description
    sub; // sous-titre
    cat;
    t; // tags (1-3)
    html; // contenu complet
    date; // YYYY-MM-DD ou "" (idée non planifiée)
    time; // HH:mm — heure de publication (fuseau défini dans Settings → Framer)
    status;
    // Synchronisation Framer (renseignée par le serveur uniquement, jamais par l'API publique)
    framerState;
    framerItemId;
    framerSyncedAt;
    framerNote; // erreur ou avertissement (ex. image non transférée)
    framerTries;
    framerNextTry;
    framerLock;
};
exports.Article = Article;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, index: true }),
    __metadata("design:type", String)
], Article.prototype, "slug", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "img", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "alt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "coverPrompt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Article.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "meta", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "sub", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "", index: true }),
    __metadata("design:type", String)
], Article.prototype, "cat", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], Article.prototype, "t", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "html", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "", index: true }),
    __metadata("design:type", String)
], Article.prototype, "date", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "09:00" }),
    __metadata("design:type", String)
], Article.prototype, "time", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: exports.STATUSES, default: "Draft", index: true }),
    __metadata("design:type", String)
], Article.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "framerState", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "framerItemId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Article.prototype, "framerSyncedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Article.prototype, "framerNote", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Article.prototype, "framerTries", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Article.prototype, "framerNextTry", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Article.prototype, "framerLock", void 0);
exports.Article = Article = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Article);
exports.ArticleSchema = mongoose_1.SchemaFactory.createForClass(Article);
exports.ArticleSchema.index({ title: "text", cat: "text", t: "text" });
