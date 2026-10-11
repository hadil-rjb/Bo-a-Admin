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
exports.ShareController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../common/roles.decorator");
const activity_service_1 = require("./activity.service");
const share_dto_1 = require("./dto/share.dto");
const share_service_1 = require("./share.service");
const actor = (r) => ({ id: r.user.sub, name: r.user.name });
let ShareController = class ShareController {
    s;
    act;
    constructor(s, act) {
        this.s = s;
        this.act = act;
    }
    state(r) { return this.s.state(r.user); }
    invite(r, d) { return this.s.invite(actor(r), d); }
    role(r, id, d) { return this.s.setRole(actor(r), id, d.role); }
    remove(r, id) { return this.s.remove(actor(r), id); }
    link(r, d) { return this.s.setLink(actor(r), d); }
    ping(r, d) { return this.s.ping(r.user, d.viewerId); }
    activity(kind, before, limit) { return this.act.list(kind, before, Number(limit) || 30); }
    restore(r, id) { return this.s.restore(actor(r), id); }
};
exports.ShareController = ShareController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "state", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Post)("members"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, share_dto_1.InviteDto]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "invite", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Patch)("members/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, share_dto_1.RoleDto]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "role", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Delete)("members/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "remove", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin"),
    (0, common_1.Put)("link"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, share_dto_1.LinkDto]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "link", null);
__decorate([
    (0, roles_decorator_1.AllowLink)(),
    (0, common_1.Post)("ping"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, share_dto_1.PingDto]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "ping", null);
__decorate([
    (0, common_1.Get)("activity"),
    __param(0, (0, common_1.Query)("kind")),
    __param(1, (0, common_1.Query)("before")),
    __param(2, (0, common_1.Query)("limit")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "activity", null);
__decorate([
    (0, roles_decorator_1.Roles)("admin", "editor"),
    (0, common_1.Post)("activity/:id/restore"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ShareController.prototype, "restore", null);
exports.ShareController = ShareController = __decorate([
    (0, common_1.Controller)("share"),
    __metadata("design:paramtypes", [share_service_1.ShareService, activity_service_1.ActivityService])
], ShareController);
