"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const jwt_1 = require("@nestjs/jwt");
const mongoose_2 = require("mongoose");
const bcrypt = __importStar(require("bcryptjs"));
const user_schema_1 = require("./user.schema");
const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
let AuthService = class AuthService {
    users;
    jwt;
    cfg;
    log = new common_1.Logger("Auth");
    fails = new Map(); // anti brute-force (par IP + email)
    constructor(users, jwt, cfg) {
        this.users = users;
        this.jwt = jwt;
        this.cfg = cfg;
    }
    /**
     * Compte admin automatique : créé au démarrage depuis ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
     * Si le compte existe déjà, son mot de passe n'est PAS écrasé — sauf ADMIN_FORCE_PASSWORD_SYNC=true
     * (utile pour récupérer l'accès : redémarrez avec ce flag, puis retirez-le).
     */
    async onModuleInit() {
        const email = this.cfg.get("ADMIN_EMAIL")?.trim().toLowerCase();
        const password = this.cfg.get("ADMIN_PASSWORD");
        if (!email || !password)
            return this.log.warn("ADMIN_EMAIL / ADMIN_PASSWORD absents : aucun admin automatique");
        if (!STRONG.test(password))
            this.log.warn("ADMIN_PASSWORD est faible (8+ car., majuscule, minuscule, chiffre) — changez-le");
        const existing = await this.users.findOne({ email }).select("+passwordHash");
        if (!existing) {
            await this.users.create({ email, name: this.cfg.get("ADMIN_NAME") ?? "Admin", role: "admin", passwordHash: await bcrypt.hash(password, 12) });
            this.log.log(`Compte admin créé : ${email}`);
        }
        else if (this.cfg.get("ADMIN_FORCE_PASSWORD_SYNC") === "true") {
            existing.passwordHash = await bcrypt.hash(password, 12);
            await existing.save();
            this.log.warn(`Mot de passe de ${email} réinitialisé depuis le .env — retirez ADMIN_FORCE_PASSWORD_SYNC`);
        }
    }
    async login(email, password, ip = "") {
        const k = `${ip}|${email.toLowerCase()}`, f = this.fails.get(k);
        if (f && f.n >= MAX_FAILS && f.until > Date.now())
            throw new common_1.HttpException("Trop de tentatives. Réessayez dans quelques minutes.", 429);
        const user = await this.users.findOne({ email: email.toLowerCase() }).select("+passwordHash");
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            const n = f && f.until > Date.now() ? f.n + 1 : 1;
            this.fails.set(k, { n, until: Date.now() + LOCK_MS });
            throw new common_1.UnauthorizedException("Email ou mot de passe incorrect");
        }
        this.fails.delete(k);
        const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
        return { token, user: await this.profile(user.id) };
    }
    async profile(id) {
        const u = await this.users.findById(id);
        if (!u)
            throw new common_1.UnauthorizedException();
        return u;
    }
    async updateProfile(id, dto) {
        const { notifications, ...rest } = dto;
        const $set = { ...rest };
        if (notifications)
            for (const [k, v] of Object.entries(notifications))
                $set[`notifications.${k}`] = v;
        try {
            const u = await this.users.findByIdAndUpdate(id, { $set }, { new: true });
            if (!u)
                throw new common_1.UnauthorizedException();
            return u;
        }
        catch (e) {
            if (e?.code === 11000)
                throw new common_1.ConflictException("Cet email est déjà utilisé");
            throw e;
        }
    }
    async changePassword(id, dto) {
        const u = await this.users.findById(id).select("+passwordHash");
        if (!u || !(await bcrypt.compare(dto.currentPassword, u.passwordHash)))
            throw new common_1.UnauthorizedException("Mot de passe actuel incorrect");
        if (dto.currentPassword === dto.newPassword)
            throw new common_1.BadRequestException("Choisissez un mot de passe différent");
        u.passwordHash = await bcrypt.hash(dto.newPassword, 12);
        await u.save();
        return { ok: true };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
