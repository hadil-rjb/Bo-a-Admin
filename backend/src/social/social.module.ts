import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BrandsService } from "./brands.service";
import { SocialBrand, SocialBrandSchema } from "./schemas/brand.schema";
import { SocialDesign, SocialDesignSchema } from "./schemas/design.schema";
import { SocialPost, SocialPostSchema } from "./schemas/post.schema";
import { SocialTemplate, SocialTemplateSchema } from "./schemas/template.schema";
import { SocialWorkspace, SocialWorkspaceSchema } from "./schemas/workspace.schema";
import { SocialBrandsController, SocialWorkspaceController } from "./social.controller";
import { WorkspaceService } from "./workspace.service";
import {
  SocialConnection, SocialConnectionSchema, SocialIntegration, SocialIntegrationSchema,
  SocialMedia, SocialMediaSchema, SocialOAuthState, SocialOAuthStateSchema,
} from "./publishing/connection.schema";
import { ConnectionsService } from "./publishing/connections.service";
import { PublisherService } from "./publishing/publisher.service";
import { PublishScheduler } from "./publishing/publish.scheduler";
import { PublishingController } from "./publishing/publishing.controller";
import { FigmaController } from "./figma/figma.controller";
import { FigmaService } from "./figma/figma.service";

/** Social Media workspace: brands, designs, posts, settings, connected accounts, publishing and Figma import (collections prefixed social_). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SocialBrand.name, schema: SocialBrandSchema },
      { name: SocialDesign.name, schema: SocialDesignSchema },
      { name: SocialPost.name, schema: SocialPostSchema },
      { name: SocialTemplate.name, schema: SocialTemplateSchema },
      { name: SocialWorkspace.name, schema: SocialWorkspaceSchema },
      { name: SocialConnection.name, schema: SocialConnectionSchema },
      { name: SocialOAuthState.name, schema: SocialOAuthStateSchema },
      { name: SocialMedia.name, schema: SocialMediaSchema },
      { name: SocialIntegration.name, schema: SocialIntegrationSchema },
    ]),
  ],
  controllers: [SocialWorkspaceController, SocialBrandsController, PublishingController, FigmaController],
  providers: [WorkspaceService, BrandsService, ConnectionsService, PublisherService, PublishScheduler, FigmaService],
})
export class SocialModule {}
