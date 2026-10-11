"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bodyParser: false });
    app.useBodyParser("json", { limit: "12mb" }); // articles + images en data URL
    app.setGlobalPrefix("api");
    app.enableCors({ origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","), credentials: true });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
