"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const core_1 = require("@nestjs/core");
const articles_module_1 = require("./articles/articles.module");
const gsc_module_1 = require("./gsc/gsc.module");
const auth_module_1 = require("./auth/auth.module");
const share_module_1 = require("./share/share.module");
const ai_module_1 = require("./ai/ai.module");
const framer_module_1 = require("./framer/framer.module");
const media_module_1 = require("./media/media.module");
const social_module_1 = require("./social/social.module");
const jwt_auth_guard_1 = require("./auth/jwt-auth.guard");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            mongoose_1.MongooseModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (c) => ({ uri: c.getOrThrow("MONGODB_URI") }),
            }),
            auth_module_1.AuthModule,
            share_module_1.ShareModule,
            ai_module_1.AiModule,
            media_module_1.MediaModule,
            articles_module_1.ArticlesModule,
            gsc_module_1.GscModule,
            framer_module_1.FramerModule,
            social_module_1.SocialModule,
        ],
        providers: [{ provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard }], // tout est protégé sauf @Public()
    })
], AppModule);
