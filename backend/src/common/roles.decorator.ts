import { SetMetadata } from "@nestjs/common";
export const ROLES = "roles";
export const ALLOW_LINK = "allowLink";
/** Rôles autorisés (admin = propriétaire). Sans décorateur : tout utilisateur connecté. */
export const Roles = (...r: string[]) => SetMetadata(ROLES, r);
/** Route accessible aussi avec un lien de partage (lecture seule) */
export const AllowLink = () => SetMetadata(ALLOW_LINK, true);
