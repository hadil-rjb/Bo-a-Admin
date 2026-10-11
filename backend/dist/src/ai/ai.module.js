"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const article_schema_1 = require("../articles/article.schema");
const gsc_module_1 = require("../gsc/gsc.module");
const ai_settings_schema_1 = require("./ai-settings.schema");
const ai_controller_1 = require("./ai.controller");
const ai_service_1 = require("./ai.service");
const cover_image_service_1 = require("./cover-image.service");
const idea_schema_1 = require("./idea.schema");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        imports: [gsc_module_1.GscModule, mongoose_1.MongooseModule.forFeature([{ name: ai_settings_schema_1.AiSettings.name, schema: ai_settings_schema_1.AiSettingsSchema }, { name: idea_schema_1.Idea.name, schema: idea_schema_1.IdeaSchema }, { name: article_schema_1.Article.name, schema: article_schema_1.ArticleSchema }])],
        controllers: [ai_controller_1.AiController],
        providers: [ai_service_1.AiService, cover_image_service_1.CoverImageService],
    })
], AiModule);
