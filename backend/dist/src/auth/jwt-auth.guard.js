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
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const public_decorator_1 = require("../common/public.decorator");
const roles_decorator_1 = require("../common/roles.decorator");
const share_service_1 = require("../share/share.service");
let JwtAuthGuard = class JwtAuthGuard {
    jwt;
    reflector;
    share;
    constructor(jwt, reflector, share) {
        this.jwt = jwt;
        this.reflector = reflector;
        this.share = share;
    }
    async canActivate(ctx) {
        const at = [ctx.getHandler(), ctx.getClass()];
        if (this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC, at))
            return true;
        const req = ctx.switchToHttp().getRequest();
        const [type, token] = (req.headers.authorization ?? "").split(" ");
        if (type === "Bearer" && token) {
            let p;
            try {
                p = await this.jwt.verifyAsync(token);
            }
            catch {
                throw new common_1.UnauthorizedException("Session expirée");
            }
            // Rôle relu en base à chaque requête : un changement de rôle ou une révocation est immédiat
            const u = await this.share.userById(p.sub);
            if (!u)
                throw new common_1.UnauthorizedException("Session expirée");
            req.user = { sub: String(u._id), role: u.role, name: u.name, email: u.email };
            const roles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES, at);
            if (roles && !roles.includes(u.role))
                throw new common_1.ForbiddenException("Vous n'avez pas les droits pour cette action");
            return true;
        }
        // Lien de partage « Anyone with the link » : lecture seule, uniquement sur les routes @AllowLink()
        const st = req.headers["x-share-token"];
        if (st && this.reflector.getAllAndOverride(roles_decorator_1.ALLOW_LINK, at) && (await this.share.checkLink(String(st)))) {
            req.user = { sub: null, role: "link", name: "Guest" };
            return true;
        }
        throw new common_1.UnauthorizedException();
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService, core_1.Reflector, share_service_1.ShareService])
], JwtAuthGuard);
