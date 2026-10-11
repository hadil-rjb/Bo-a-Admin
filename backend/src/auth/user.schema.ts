import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema({ _id: false })
class Notifications {
  @Prop({ default: true }) seo: boolean;
  @Prop({ default: true }) editorial: boolean;
  @Prop({ default: true }) gsc: boolean;
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: "" }) job: string;
  @Prop({ default: "" }) bio: string;
  @Prop({ default: "" }) avatar: string; // data URL ou URL
  @Prop({ default: "admin" }) role: string; // admin = propriétaire · editor · viewer
  @Prop() lastActiveAt?: Date;
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ type: SchemaFactory.createForClass(Notifications), default: () => ({}) }) notifications: Notifications;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
