"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FramerModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const article_schema_1 = require("../articles/article.schema");
const framer_settings_schema_1 = require("./framer-settings.schema");
const framer_controller_1 = require("./framer.controller");
const framer_scheduler_1 = require("./framer.scheduler");
const framer_service_1 = require("./framer.service");
let FramerModule = class FramerModule {
};
exports.FramerModule = FramerModule;
exports.FramerModule = FramerModule = __decorate([
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: framer_settings_schema_1.FramerSettings.name, schema: framer_settings_schema_1.FramerSettingsSchema }, { name: article_schema_1.Article.name, schema: article_schema_1.ArticleSchema }])],
        controllers: [framer_controller_1.FramerController],
        providers: [framer_service_1.FramerService, framer_scheduler_1.FramerScheduler],
    })
], FramerModule);
