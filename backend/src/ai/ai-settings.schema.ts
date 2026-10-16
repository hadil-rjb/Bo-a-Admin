import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/** Réglages IA (document unique). Les clés API sont chiffrées (AES-256-GCM) et jamais renvoyées au navigateur. */
@Schema({ timestamps: true })
export class AiSettings {
  @Prop({ default: "anthropic" }) provider: "anthropic" | "groq";
  @Prop({ default: "claude-sonnet-5-5" }) anthropicModel: string;
  @Prop({ default: "llama-3.3-70b-versatile" }) groqModel: string;
  @Prop({ select: false }) anthropicKey?: string;
  @Prop({ select: false }) groqKey?: string;
  @Prop({ default: "" }) brief: string;       // audience, ton, objectifs, sujets à éviter
  @Prop({ default: "English" }) language: string;
  @Prop({ default: "" }) coverStyle: string;          // guide de style visuel des couvertures
  @Prop({ default: "" }) coverStyleSource: string;    // vision | alt | manual
  @Prop() coverStyleAt?: Date;
  @Prop({ select: false }) hfKey?: string;                              // jeton Hugging Face (chiffré)
  @Prop({ default: "black-forest-labs/FLUX.1-schnell" }) hfModel: string;
  @Prop({ default: "" }) imageKeywords: string;                         // mots-clés de style ajoutés à chaque génération
  @Prop({ default: "" }) imageNegative: string;
  @Prop({ default: "" }) imageKeywordsSource: string;                   // auto | manual
  @Prop({ type: Object, default: null }) coverProfile?: { ratio: string; aspect: number; palette: string[]; samples: number } | null;
}
export type AiSettingsDocument = HydratedDocument<AiSettings>;
export const AiSettingsSchema = SchemaFactory.createForClass(AiSettings);
