"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShareModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const user_schema_1 = require("../auth/user.schema");
const article_schema_1 = require("../articles/article.schema");
const activity_schema_1 = require("./activity.schema");
const share_settings_schema_1 = require("./share-settings.schema");
const activity_service_1 = require("./activity.service");
const share_controller_1 = require("./share.controller");
const share_service_1 = require("./share.service");
let ShareModule = class ShareModule {
};
exports.ShareModule = ShareModule;
exports.ShareModule = ShareModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema }, { name: article_schema_1.Article.name, schema: article_schema_1.ArticleSchema },
                { name: activity_schema_1.Activity.name, schema: activity_schema_1.ActivitySchema }, { name: share_settings_schema_1.ShareSettings.name, schema: share_settings_schema_1.ShareSettingsSchema },
            ])],
        controllers: [share_controller_1.ShareController],
        providers: [share_service_1.ShareService, activity_service_1.ActivityService],
        exports: [share_service_1.ShareService, activity_service_1.ActivityService],
    })
], ShareModule);
