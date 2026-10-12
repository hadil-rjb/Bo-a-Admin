"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bodyParser: false });
    app.useBodyParser("json", { limit: "12mb" }); // articles + images en data URL
    app.setGlobalPrefix("api");
    app.enableCors({
        origin: [
            "http://localhost:3000",
        ],
        credentials: true,
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
