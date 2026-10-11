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
exports.MediaSchema = exports.Media = void 0;
const mongoose_1 = require("@nestjs/mongoose");
/** Couvertures générées puis acceptées : hébergées par l'API (URL stable) plutôt qu'embarquées en base64 dans chaque article */
let Media = class Media {
    data;
    mime;
    size;
    width;
    height;
    model;
    createdBy;
};
exports.Media = Media;
__decorate([
    (0, mongoose_1.Prop)({ required: true, select: false }),
    __metadata("design:type", Buffer)
], Media.prototype, "data", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "image/webp" }),
    __metadata("design:type", String)
], Media.prototype, "mime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Media.prototype, "size", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Media.prototype, "width", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Media.prototype, "height", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Media.prototype, "model", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Media.prototype, "createdBy", void 0);
exports.Media = Media = __decorate([
    (0, mongoose_1.Schema)({ timestamps: { createdAt: true, updatedAt: false } })
], Media);
exports.MediaSchema = mongoose_1.SchemaFactory.createForClass(Media);
