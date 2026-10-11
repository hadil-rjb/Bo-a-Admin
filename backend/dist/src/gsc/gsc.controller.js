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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GscController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../common/public.decorator");
const roles_decorator_1 = require("../common/roles.decorator");
const gsc_service_1 = require("./gsc.service");
let GscController = class GscController {
    s;
    constructor(s) {
        this.s = s;
    }
    status() { return this.s.status(); }
    async authUrl(r) { return { url: await this.s.authUrl(r.user.sub) }; }
    performance(days) { return this.s.performance(Number(days) || 28); }
    sites() { return this.s.sites(); }
    setSite(site) { return this.s.setSite(site); }
    inspect(url) { return this.s.inspect(url); }
    disconnect() { return this.s.disconnect(); }
    /** Redirection depuis Google (navigateur, sans header Authorization) → protégée par le `state` JWT */
    async callback(code, state, error) {
        try {
            if (error || !code || !state)
                throw new Error(error ?? "Code d'autorisation manquant");
            await this.s.handleCallback(code, state);
            return { url: `${this.s.frontUrl}/?connected=1` };
        }
        catch (e) {
            return { url: `${this.s.frontUrl}/?error=${encodeURIComponent(e.message)}` };
        }
    }
};
exports.GscController = GscController;
__decorate([
    (0, common_1.Get)("status"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GscController.prototype, "status", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Get)("auth-url"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GscController.prototype, "authUrl", null);
__decorate([
    (0, common_1.Get)("performance"),
    __param(0, (0, common_1.Query)("days")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GscController.prototype, "performance", null);
__decorate([
    (0, common_1.Get)("sites"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GscController.prototype, "sites", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Put)("site"),
    __param(0, (0, common_1.Body)("site")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GscController.prototype, "setSite", null);
__decorate([
    (0, common_1.Get)("inspect"),
    __param(0, (0, common_1.Query)("url")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GscController.prototype, "inspect", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Delete)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GscController.prototype, "disconnect", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)("callback"),
    (0, common_1.Redirect)(),
    __param(0, (0, common_1.Query)("code")),
    __param(1, (0, common_1.Query)("state")),
    __param(2, (0, common_1.Query)("error")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], GscController.prototype, "callback", null);
exports.GscController = GscController = __decorate([
    (0, common_1.Controller)("gsc"),
    __metadata("design:paramtypes", [gsc_service_1.GscService])
], GscController);
