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
exports.ActivitySchema = exports.Activity = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let Change = class Change {
    f;
    from;
    to;
};
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Change.prototype, "f", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Change.prototype, "from", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Change.prototype, "to", void 0);
Change = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], Change);
/** Journal : modifications d'articles, changements de partage et ouvertures de l'admin */
let Activity = class Activity {
    kind;
    action;
    actorId;
    actorName;
    target;
    slug;
    changes;
    before; // valeurs précédentes (restauration)
    restorable;
    restoredAt;
    createdAt;
};
exports.Activity = Activity;
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], Activity.prototype, "kind", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Activity.prototype, "action", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Activity.prototype, "actorId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Activity.prototype, "actorName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Activity.prototype, "target", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], Activity.prototype, "slug", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_1.SchemaFactory.createForClass(Change)], default: [] }),
    __metadata("design:type", Array)
], Activity.prototype, "changes", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, select: false }),
    __metadata("design:type", Object)
], Activity.prototype, "before", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Activity.prototype, "restorable", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Activity.prototype, "restoredAt", void 0);
exports.Activity = Activity = __decorate([
    (0, mongoose_1.Schema)({ timestamps: { createdAt: true, updatedAt: false } })
], Activity);
exports.ActivitySchema = mongoose_1.SchemaFactory.createForClass(Activity);
exports.ActivitySchema.index({ createdAt: -1 });
exports.ActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 }); // 180 jours
