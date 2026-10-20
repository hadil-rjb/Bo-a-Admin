import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { AiService } from "../../ai/ai.service";
import { validTz } from "../../framer/time";
import { analyzeWithClaude, heuristic, importWithClaude, Layer, Mapping, ratingWithClaude, sanitize, translateWithClaude } from "./analyze";
import { COUNTRY_CODES, dayEvents, Source } from "./feeds";

@Injectable()
export class CalendarService {
  private log = new Logger("Calendar");
  constructor(private ai: AiService) {}

  async events(q: { date: string; tz?: string; countries?: string; source?: string }) {
    const tz = q.tz && validTz(q.tz) ? q.tz : "UTC";
    const countries = (q.countries || "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => COUNTRY_CODES.includes(c));
    try {
      return { date: q.date, tz, ...(await dayEvents(q.date, tz, countries.length ? countries : COUNTRY_CODES, q.source === "forexfactory" ? "forexfactory" : "tradingview" as Source)) };
    } catch (e: any) {
      throw new BadGatewayException(e?.message || "The calendar sources didn't answer");
    }
  }

  /**
   * Finds the calendar on a slide. Claude reads it when a key is set in Settings → AI (and `engine`
   * isn't "heuristic"); otherwise, or if Claude fails, the layout heuristic does.
   */
  async analyze(input: { layers: Layer[]; w: number; h: number; image?: string; engine?: "auto" | "heuristic" }): Promise<Mapping & { note?: string }> {
    const quick = () => ({ ...sanitize(heuristic(input.layers, input.w, input.h), input.layers), engine: "heuristic" as const });
    if (input.engine === "heuristic") return quick();
    const key = await this.ai.anthropicKey();
    if (!key) return { ...quick(), note: "Read from the layout. Add a Claude key in Settings → AI assistant for a deeper analysis." };
    try {
      const { mapping, model } = await analyzeWithClaude(key, input);
      // Claude found nothing but the layout clearly is a calendar: trust the layout
      if (!mapping.isCalendar) { const h = quick(); if (h.isCalendar) return { ...h, note: `Claude didn't see a calendar (${mapping.reason}); read from the layout instead.` }; }
      return { ...mapping, engine: "claude", model };
    } catch (e: any) {
      this.log.warn(`Claude analysis failed, using the layout heuristic: ${e?.message || e}`);
      return { ...quick(), note: `Claude was unavailable (${e?.message || "error"}), so the slide was read from its layout.` };
    }
  }

  /** Rebuilds a picture as editable layers (needs a Claude key: reading a picture needs vision) */
  async importImage(input: { image: string; imgW: number; imgH: number }) {
    const key = await this.ai.anthropicKey();
    if (!key) throw new BadRequestException("Add a Claude key in Settings → AI assistant to turn pictures into editable layers");
    try {
      return await importWithClaude(key, input);
    } catch (e: any) {
      this.log.warn(`Image import failed: ${e?.message || e}`);
      throw new BadGatewayException(`Claude couldn't rebuild this picture: ${e?.message || "error"}`);
    }
  }

  /** What a rating picture shows (stars, how many, colours). null without a Claude key: the studio reads the pixels instead. */
  async rating(image: string) {
    const key = await this.ai.anthropicKey();
    if (!key) return { engine: "pixels" as const, rating: null };
    try {
      return { engine: "claude" as const, rating: await ratingWithClaude(key, image) };
    } catch (e: any) {
      this.log.warn(`Rating read failed: ${e?.message || e}`);
      return { engine: "pixels" as const, rating: null, note: `Claude was unavailable (${e?.message || "error"})` };
    }
  }

  /** Slide texts in another language (Claude). Without a key: { engine: "none" } and the studio uses its small dictionary. */
  async translate(input: { items: { id: string; text: string }[]; to: "ar" | "en"; brand?: string }) {
    const key = await this.ai.anthropicKey();
    if (!key) return { engine: "none" as const, items: [] };
    try {
      return { engine: "claude" as const, ...(await translateWithClaude(key, input)) };
    } catch (e: any) {
      this.log.warn(`Translation failed: ${e?.message || e}`);
      return { engine: "none" as const, items: [], note: `Claude was unavailable (${e?.message || "error"})` };
    }
  }
}
