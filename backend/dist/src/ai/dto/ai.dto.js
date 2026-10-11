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
exports.CoverImageDto = exports.GenerateArticleDto = exports.GenerateIdeasDto = exports.CoverPromptDto = exports.UpdateAiSettingsDto = void 0;
const class_validator_1 = require("class-validator");
const MODEL = /^[\w.\-:\/]+$/;
class UpdateAiSettingsDto {
    provider;
    anthropicModel;
    groqModel;
    anthropicKey;
    groqKey;
    clearKeys;
    hfKey;
    hfModel;
    imageKeywords;
    imageNegative;
    brief;
    language;
    coverStyle;
}
exports.UpdateAiSettingsDto = UpdateAiSettingsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(["anthropic", "groq"]),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "provider", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    (0, class_validator_1.Matches)(MODEL),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "anthropicModel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    (0, class_validator_1.Matches)(MODEL),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "groqModel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    (0, class_validator_1.MaxLength)(400),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "anthropicKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    (0, class_validator_1.MaxLength)(400),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "groqKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsIn)(["anthropic", "groq", "hf"], { each: true }),
    __metadata("design:type", Array)
], UpdateAiSettingsDto.prototype, "clearKeys", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    (0, class_validator_1.MaxLength)(400),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "hfKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    (0, class_validator_1.Matches)(/^[\w.-]+\/[\w.-]+$/),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "hfModel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(600),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "imageKeywords", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(400),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "imageNegative", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "brief", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "language", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2500),
    __metadata("design:type", String)
], UpdateAiSettingsDto.prototype, "coverStyle", void 0);
class CoverPromptDto {
    title;
    cat;
    meta;
    sub;
    t;
    text;
}
exports.CoverPromptDto = CoverPromptDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CoverPromptDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CoverPromptDto.prototype, "cat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(400),
    __metadata("design:type", String)
], CoverPromptDto.prototype, "meta", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(400),
    __metadata("design:type", String)
], CoverPromptDto.prototype, "sub", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(5),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CoverPromptDto.prototype, "t", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CoverPromptDto.prototype, "text", void 0);
class GenerateIdeasDto {
    count;
    focus;
}
exports.GenerateIdeasDto = GenerateIdeasDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], GenerateIdeasDto.prototype, "count", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], GenerateIdeasDto.prototype, "focus", void 0);
class GenerateArticleDto {
    date;
}
exports.GenerateArticleDto = GenerateArticleDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^(\d{4}-\d{2}-\d{2})?$/, { message: "date au format YYYY-MM-DD" }),
    __metadata("design:type", String)
], GenerateArticleDto.prototype, "date", void 0);
class CoverImageDto {
    prompt;
    ratio;
    seed;
}
exports.CoverImageDto = CoverImageDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(20),
    (0, class_validator_1.MaxLength)(3000),
    __metadata("design:type", String)
], CoverImageDto.prototype, "prompt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\d{1,2}:\d{1,2}$/),
    __metadata("design:type", String)
], CoverImageDto.prototype, "ratio", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CoverImageDto.prototype, "seed", void 0);
