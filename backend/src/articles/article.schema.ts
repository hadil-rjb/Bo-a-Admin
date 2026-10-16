import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export const STATUSES = ["Live", "Scheduled", "Draft"] as const;
export type Status = (typeof STATUSES)[number];

@Schema({ timestamps: true })
export class Article {
  @Prop({ required: true, unique: true, index: true }) slug: string;
  @Prop({ default: "" }) img: string;   // URL ou data URL (cover)
  @Prop({ default: "" }) alt: string;
  @Prop({ default: "" }) coverPrompt: string; // prompt pour générer l'image de couverture
  @Prop({ required: true }) title: string;
  @Prop({ default: "" }) meta: string;  // meta description
  @Prop({ default: "" }) sub: string;   // sous-titre
  @Prop({ default: "", index: true }) cat: string;
  @Prop({ type: [String], default: [] }) t: string[]; // tags (1-3)
  @Prop({ default: "" }) html: string;  // contenu complet
  @Prop({ default: "", index: true }) date: string; // YYYY-MM-DD ou "" (idée non planifiée)
  @Prop({ default: "09:00" }) time: string; // HH:mm — heure de publication (fuseau défini dans Settings → Framer)
  @Prop({ enum: STATUSES, default: "Draft", index: true }) status: Status;
  // Synchronisation Framer (renseignée par le serveur uniquement, jamais par l'API publique)
  @Prop({ default: "" }) framerState: "" | "synced" | "error";
  @Prop({ default: "" }) framerItemId: string;
  @Prop() framerSyncedAt?: Date;
  @Prop({ default: "" }) framerNote: string;   // erreur ou avertissement (ex. image non transférée)
  @Prop({ default: 0 }) framerTries: number;
  @Prop() framerNextTry?: Date;
  @Prop() framerLock?: Date;
}
export type ArticleDocument = HydratedDocument<Article>;
export const ArticleSchema = SchemaFactory.createForClass(Article);
ArticleSchema.index({ title: "text", cat: "text", t: "text" });
