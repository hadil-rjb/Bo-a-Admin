import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { AllowLink, Roles } from "../common/roles.decorator";
import { ArticlesService } from "./articles.service";
import { CreateArticleDto, ListArticlesQuery, UpdateArticleDto } from "./dto/article.dto";

const actor = (r: any) => ({ id: r.user.sub as string, name: r.user.name as string });

@Controller("articles")
export class ArticlesController {
  constructor(private s: ArticlesService) {}
  // Routes statiques déclarées avant ":slug"
  @AllowLink() @Get() list(@Query() q: ListArticlesQuery) { return this.s.list(q); }
  @AllowLink() @Get("upcoming") upcoming() { return this.s.upcoming(); }
  @AllowLink() @Get("summary") summary() { return this.s.summary(); }
  @AllowLink() @Get("categories") categories() { return this.s.categories(); }
  @AllowLink() @Get("calendar/:month") calendar(@Param("month") m: string) { return this.s.calendar(m); }
  @AllowLink() @Get(":slug") get(@Param("slug") slug: string) { return this.s.get(slug); }
  @Roles("admin", "editor") @Post() create(@Body() d: CreateArticleDto, @Req() r: any) { return this.s.create(d, actor(r)); }
  @Roles("admin", "editor") @Patch(":slug") update(@Param("slug") slug: string, @Body() d: UpdateArticleDto, @Req() r: any) { return this.s.update(slug, d, actor(r)); }
  @Roles("admin", "editor") @Delete(":slug") remove(@Param("slug") slug: string, @Req() r: any) { return this.s.remove(slug, actor(r)); }
}
