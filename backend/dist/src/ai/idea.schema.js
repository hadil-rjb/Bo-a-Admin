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
exports.IdeaSchema = exports.Idea = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let Idea = class Idea {
    title;
    angle;
    cat;
    keyword;
    intent;
    rationale; // signal de données qui justifie l'idée
    tags;
    outline; // structure suggérée (H2)
    format;
    priority;
    status;
    articleSlug;
    model;
};
exports.Idea = Idea;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Idea.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Idea.prototype, "angle", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Idea.prototype, "cat", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Idea.prototype, "keyword", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "informational" }),
    __metadata("design:type", String)
], Idea.prototype, "intent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Idea.prototype, "rationale", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], Idea.prototype, "tags", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], Idea.prototype, "outline", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "guide" }),
    __metadata("design:type", String)
], Idea.prototype, "format", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 50 }),
    __metadata("design:type", Number)
], Idea.prototype, "priority", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "new", index: true }),
    __metadata("design:type", String)
], Idea.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Idea.prototype, "articleSlug", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Idea.prototype, "model", void 0);
exports.Idea = Idea = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Idea);
exports.IdeaSchema = mongoose_1.SchemaFactory.createForClass(Idea);
