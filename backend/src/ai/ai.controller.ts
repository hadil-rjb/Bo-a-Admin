import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from "@nestjs/common";
import { Roles } from "../common/roles.decorator";
import { AiService, Provider } from "./ai.service";
import { CoverImageService } from "./cover-image.service";
import { AgentStepDto, CoverImageDto, CoverPromptDto, GenerateArticleDto, GenerateIdeasDto, SocialCaptionDto, UpdateAiSettingsDto } from "./dto/ai.dto";

const actor = (r: any) => ({ id: r.user.sub as string, name: r.user.name as string });

@Controller("ai")
export class AiController {
  constructor(private s: AiService, private img: CoverImageService) {}
  @Get("settings") settings() { return this.s.view(); }
  @Roles("admin") @Put("settings") save(@Req() r: any, @Body() d: UpdateAiSettingsDto) { return this.s.update(d, actor(r)); }
  @Roles("admin") @Get("models") models(@Query("provider") p: string) { return this.s.models(p === "groq" ? "groq" : ("anthropic" as Provider)); }
  @Get("ideas") ideas() { return this.s.listIdeas(); }
  @Roles("admin", "editor") @Post("ideas/generate") generate(@Req() r: any, @Body() d: GenerateIdeasDto) { return this.s.generateIdeas(d, actor(r)); }
  @Roles("admin", "editor") @Post("ideas/:id/article") article(@Req() r: any, @Param("id") id: string, @Body() d: GenerateArticleDto) { return this.s.generateArticle(id, d.date || undefined, actor(r)); }
  @Roles("admin") @Get("image-models") imageModels() { return this.s.imageModels(); }
  @Roles("admin", "editor") @Post("cover-image") coverImage(@Req() r: any, @Body() d: CoverImageDto) { return this.img.generate(d, actor(r)); }
  @Roles("admin") @Post("cover-style/analyze") analyzeCover() { return this.s.analyzeCoverStyle(); }
  @Roles("admin", "editor") @Post("cover-prompt") cover(@Req() r: any, @Body() d: CoverPromptDto) { return this.s.coverPrompt(d, actor(r)); }
  @Roles("admin", "editor") @Post("social-caption") caption(@Req() r: any, @Body() d: SocialCaptionDto) { return this.s.socialCaption(d, actor(r)); }
  /** Studio Agent: models to choose from, and one turn of the agent */
  @Roles("admin", "editor") @Get("agent/models") agentModels() { return this.s.agentModels(); }
  @Roles("admin", "editor") @Post("agent") @HttpCode(200) agent(@Req() r: any, @Body() d: AgentStepDto) { return this.s.agentStep(d, actor(r)); }
  @Roles("admin", "editor") @Delete("ideas/:id") dismiss(@Param("id") id: string) { return this.s.dismiss(id); }
}
