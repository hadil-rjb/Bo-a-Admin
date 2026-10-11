import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC } from "../common/public.decorator";
import { ALLOW_LINK, ROLES } from "../common/roles.decorator";
import { ShareService } from "../share/share.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private share: ShareService) {}
  async canActivate(ctx: ExecutionContext) {
    const at = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, at)) return true;
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? "").split(" ");
    if (type === "Bearer" && token) {
      let p: { sub: string };
      try { p = await this.jwt.verifyAsync(token); } catch { throw new UnauthorizedException("Session expirée"); }
      // Rôle relu en base à chaque requête : un changement de rôle ou une révocation est immédiat
      const u: any = await this.share.userById(p.sub);
      if (!u) throw new UnauthorizedException("Session expirée");
      req.user = { sub: String(u._id), role: u.role, name: u.name, email: u.email };
      const roles = this.reflector.getAllAndOverride<string[]>(ROLES, at);
      if (roles && !roles.includes(u.role)) throw new ForbiddenException("Vous n'avez pas les droits pour cette action");
      return true;
    }
    // Lien de partage « Anyone with the link » : lecture seule, uniquement sur les routes @AllowLink()
    const st = req.headers["x-share-token"];
    if (st && this.reflector.getAllAndOverride<boolean>(ALLOW_LINK, at) && (await this.share.checkLink(String(st)))) {
      req.user = { sub: null, role: "link", name: "Guest" };
      return true;
    }
    throw new UnauthorizedException();
  }
}
