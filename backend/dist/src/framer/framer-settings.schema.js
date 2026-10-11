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
exports.FramerSettingsSchema = exports.FramerSettings = void 0;
const mongoose_1 = require("@nestjs/mongoose");
/** Réglages Framer (document unique). La clé API est chiffrée (AES-256-GCM) et jamais renvoyée au navigateur. */
let FramerSettings = class FramerSettings {
    enabled; // publication automatique des articles planifiés
    projectUrl; // https://framer.com/projects/…
    apiKey;
    collectionId; // collection CMS « blog »
    collectionName;
    fieldMap; // clé article → id de champ Framer ("" = auto, "-" = ignorer)
    publish; // lancer framer.publish() après l'ajout
    deploy; // promouvoir en production (sinon : preview seulement)
    timezone; // fuseau des heures de planification
};
exports.FramerSettings = FramerSettings;
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], FramerSettings.prototype, "enabled", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], FramerSettings.prototype, "projectUrl", void 0);
__decorate([
    (0, mongoose_1.Prop)({ select: false }),
    __metadata("design:type", String)
], FramerSettings.prototype, "apiKey", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], FramerSettings.prototype, "collectionId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], FramerSettings.prototype, "collectionName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], FramerSettings.prototype, "fieldMap", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], FramerSettings.prototype, "publish", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], FramerSettings.prototype, "deploy", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "Africa/Tunis" }),
    __metadata("design:type", String)
], FramerSettings.prototype, "timezone", void 0);
exports.FramerSettings = FramerSettings = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], FramerSettings);
exports.FramerSettingsSchema = mongoose_1.SchemaFactory.createForClass(FramerSettings);
