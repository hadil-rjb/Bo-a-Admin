import { BadRequestException, ConflictException, HttpException, Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { Model } from "mongoose";
import * as bcrypt from "bcryptjs";
import { User, UserDocument } from "./user.schema";
import { ChangePasswordDto, UpdateProfileDto } from "./dto/auth.dto";

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;

@Injectable()
export class AuthService implements OnModuleInit {
  private log = new Logger("Auth");
  private fails = new Map<string, { n: number; until: number }>(); // anti brute-force (par IP + email)
  constructor(
    @InjectModel(User.name) private users: Model<UserDocument>,
    private jwt: JwtService,
    private cfg: ConfigService,
  ) {}

  /**
   * Compte admin automatique : créé au démarrage depuis ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
   * Si le compte existe déjà, son mot de passe n'est PAS écrasé — sauf ADMIN_FORCE_PASSWORD_SYNC=true
   * (utile pour récupérer l'accès : redémarrez avec ce flag, puis retirez-le).
   */
  async onModuleInit() {
    const email = this.cfg.get<string>("ADMIN_EMAIL")?.trim().toLowerCase();
    const password = this.cfg.get<string>("ADMIN_PASSWORD");
    if (!email || !password) return this.log.warn("ADMIN_EMAIL / ADMIN_PASSWORD absents : aucun admin automatique");
    if (!STRONG.test(password)) this.log.warn("ADMIN_PASSWORD est faible (8+ car., majuscule, minuscule, chiffre) — changez-le");
    const existing = await this.users.findOne({ email }).select("+passwordHash");
    if (!existing) {
      await this.users.create({ email, name: this.cfg.get("ADMIN_NAME") || "Admin", role: "admin", passwordHash: await bcrypt.hash(password, 12) });
      this.log.log(`Compte admin créé : ${email}`);
    } else if (this.cfg.get("ADMIN_FORCE_PASSWORD_SYNC") === "true") {
      existing.passwordHash = await bcrypt.hash(password, 12);
      await existing.save();
      this.log.warn(`Mot de passe de ${email} réinitialisé depuis le .env — retirez ADMIN_FORCE_PASSWORD_SYNC`);
    }
  }

  async login(email: string, password: string, ip = "") {
    const k = `${ip}|${email.toLowerCase()}`, f = this.fails.get(k);
    if (f && f.n >= MAX_FAILS && f.until > Date.now()) throw new HttpException("Trop de tentatives. Réessayez dans quelques minutes.", 429);
    const user = await this.users.findOne({ email: email.toLowerCase() }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      const n = f && f.until > Date.now() ? f.n + 1 : 1;
      this.fails.set(k, { n, until: Date.now() + LOCK_MS });
      throw new UnauthorizedException("Email ou mot de passe incorrect");
    }
    this.fails.delete(k);
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { token, user: await this.profile(user.id) };
  }

  async profile(id: string) {
    const u = await this.users.findById(id);
    if (!u) throw new UnauthorizedException();
    return u;
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const { notifications, ...rest } = dto;
    const $set: Record<string, unknown> = { ...rest };
    if (notifications) for (const [k, v] of Object.entries(notifications)) $set[`notifications.${k}`] = v;
    try {
      const u = await this.users.findByIdAndUpdate(id, { $set }, { new: true });
      if (!u) throw new UnauthorizedException();
      return u;
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException("Cet email est déjà utilisé");
      throw e;
    }
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const u = await this.users.findById(id).select("+passwordHash");
    if (!u || !(await bcrypt.compare(dto.currentPassword, u.passwordHash)))
      throw new UnauthorizedException("Mot de passe actuel incorrect");
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException("Choisissez un mot de passe différent");
    u.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await u.save();
    return { ok: true };
  }
}
