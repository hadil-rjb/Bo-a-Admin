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
exports.PingDto = exports.LinkDto = exports.RoleDto = exports.InviteDto = void 0;
const class_validator_1 = require("class-validator");
class InviteDto {
    name;
    email;
    role;
}
exports.InviteDto = InviteDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], InviteDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], InviteDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsIn)(["editor", "viewer"]),
    __metadata("design:type", String)
], InviteDto.prototype, "role", void 0);
class RoleDto {
    role;
}
exports.RoleDto = RoleDto;
__decorate([
    (0, class_validator_1.IsIn)(["editor", "viewer"]),
    __metadata("design:type", String)
], RoleDto.prototype, "role", void 0);
class LinkDto {
    enabled;
    regenerate;
}
exports.LinkDto = LinkDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], LinkDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], LinkDto.prototype, "regenerate", void 0);
class PingDto {
    viewerId;
}
exports.PingDto = PingDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], PingDto.prototype, "viewerId", void 0);
