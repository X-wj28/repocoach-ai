import { NestFactory } from "@nestjs/core";
import { config } from "dotenv";
import { resolve } from "node:path";
import { AppModule } from "./app.module";
import { configureApplication } from "./configure-application";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: false });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  configureApplication(app);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`RepoCoach API listening on http://localhost:${port}`);
}

void bootstrap();
