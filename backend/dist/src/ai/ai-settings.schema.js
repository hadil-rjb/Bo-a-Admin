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
exports.AiSettingsSchema = exports.AiSettings = void 0;
const mongoose_1 = require("@nestjs/mongoose");
/** Réglages IA (document unique). Les clés API sont chiffrées (AES-256-GCM) et jamais renvoyées au navigateur. */
let AiSettings = class AiSettings {
    provider;
    anthropicModel;
    groqModel;
    anthropicKey;
    groqKey;
    brief; // audience, ton, objectifs, sujets à éviter
    language;
    coverStyle; // guide de style visuel des couvertures
    coverStyleSource; // vision | alt | manual
    coverStyleAt;
    hfKey; // jeton Hugging Face (chiffré)
    hfModel;
    imageKeywords; // mots-clés de style ajoutés à chaque génération
    imageNegative;
    imageKeywordsSource; // auto | manual
    coverProfile;
};
exports.AiSettings = AiSettings;
__decorate([
    (0, mongoose_1.Prop)({ default: "anthropic" }),
    __metadata("design:type", String)
], AiSettings.prototype, "provider", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "claude-sonnet-5-5" }),
    __metadata("design:type", String)
], AiSettings.prototype, "anthropicModel", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "llama-3.3-70b-versatile" }),
    __metadata("design:type", String)
], AiSettings.prototype, "groqModel", void 0);
__decorate([
    (0, mongoose_1.Prop)({ select: false }),
    __metadata("design:type", String)
], AiSettings.prototype, "anthropicKey", void 0);
__decorate([
    (0, mongoose_1.Prop)({ select: false }),
    __metadata("design:type", String)
], AiSettings.prototype, "groqKey", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], AiSettings.prototype, "brief", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "English" }),
    __metadata("design:type", String)
], AiSettings.prototype, "language", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], AiSettings.prototype, "coverStyle", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], AiSettings.prototype, "coverStyleSource", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], AiSettings.prototype, "coverStyleAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ select: false }),
    __metadata("design:type", String)
], AiSettings.prototype, "hfKey", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "black-forest-labs/FLUX.1-schnell" }),
    __metadata("design:type", String)
], AiSettings.prototype, "hfModel", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], AiSettings.prototype, "imageKeywords", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], AiSettings.prototype, "imageNegative", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], AiSettings.prototype, "imageKeywordsSource", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: null }),
    __metadata("design:type", Object)
], AiSettings.prototype, "coverProfile", void 0);
exports.AiSettings = AiSettings = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], AiSettings);
exports.AiSettingsSchema = mongoose_1.SchemaFactory.createForClass(AiSettings);
