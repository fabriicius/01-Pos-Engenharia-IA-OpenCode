import { NestFactory } from "@nestjs/core";
import { DatabaseClient } from "./auth/infrastructure/database";
import { AppModule } from "./app.module";
import { ObservabilityService } from "./observability/observability.service";
import { configureApp } from "./setup";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.get(ObservabilityService).start();
  app.get(DatabaseClient).startMonitoring();
  await app.listen(3000);
}

void bootstrap();
