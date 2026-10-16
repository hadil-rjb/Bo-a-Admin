"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bodyParser: false });
    // articles + social designs embed images as data URLs
    app.useBodyParser("json", { limit: process.env.BODY_LIMIT || "50mb" });
    app.setGlobalPrefix("api");
    app.enableCors({
        origin: [
            "https://boga-workspace.vercel.app",
            "http://localhost:3000",
        ],
        credentials: true,
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(process.env.PORT || 4000);
}
bootstrap();
