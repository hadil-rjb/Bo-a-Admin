import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/** Réglages Framer (document unique). La clé API est chiffrée (AES-256-GCM) et jamais renvoyée au navigateur. */
@Schema({ timestamps: true })
export class FramerSettings {
  @Prop({ default: false }) enabled: boolean;            // publication automatique des articles planifiés
  @Prop({ default: "" }) projectUrl: string;             // https://framer.com/projects/…
  @Prop({ select: false }) apiKey?: string;
  @Prop({ default: "" }) collectionId: string;           // collection CMS « blog »
  @Prop({ default: "" }) collectionName: string;
  @Prop({ type: Object, default: {} }) fieldMap: Record<string, string>; // clé article → id de champ Framer ("" = auto, "-" = ignorer)
  @Prop({ default: true }) publish: boolean;             // lancer framer.publish() après l'ajout
  @Prop({ default: true }) deploy: boolean;              // promouvoir en production (sinon : preview seulement)
  @Prop({ default: "Africa/Tunis" }) timezone: string;   // fuseau des heures de planification
}
export type FramerSettingsDocument = HydratedDocument<FramerSettings>;
export const FramerSettingsSchema = SchemaFactory.createForClass(FramerSettings);
