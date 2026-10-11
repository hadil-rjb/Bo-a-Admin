"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllowLink = exports.Roles = exports.ALLOW_LINK = exports.ROLES = void 0;
const common_1 = require("@nestjs/common");
exports.ROLES = "roles";
exports.ALLOW_LINK = "allowLink";
/** Rôles autorisés (admin = propriétaire). Sans décorateur : tout utilisateur connecté. */
const Roles = (...r) => (0, common_1.SetMetadata)(exports.ROLES, r);
exports.Roles = Roles;
/** Route accessible aussi avec un lien de partage (lecture seule) */
const AllowLink = () => (0, common_1.SetMetadata)(exports.ALLOW_LINK, true);
exports.AllowLink = AllowLink;
