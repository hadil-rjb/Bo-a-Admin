import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
@Schema({ timestamps: true })
export class GscConnection {
  @Prop({ required: true, select: false }) refreshToken: string; // chiffré
  @Prop({ required: true }) site: string;
  @Prop({ default: () => new Date() }) connectedAt: Date;
}
export type GscConnectionDocument = HydratedDocument<GscConnection>;
export const GscConnectionSchema = SchemaFactory.createForClass(GscConnection);
