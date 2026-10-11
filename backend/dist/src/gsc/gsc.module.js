"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GscModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const gsc_controller_1 = require("./gsc.controller");
const gsc_schema_1 = require("./gsc.schema");
const gsc_service_1 = require("./gsc.service");
let GscModule = class GscModule {
};
exports.GscModule = GscModule;
exports.GscModule = GscModule = __decorate([
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: gsc_schema_1.GscConnection.name, schema: gsc_schema_1.GscConnectionSchema }])],
        controllers: [gsc_controller_1.GscController], providers: [gsc_service_1.GscService], exports: [gsc_service_1.GscService],
    })
], GscModule);
