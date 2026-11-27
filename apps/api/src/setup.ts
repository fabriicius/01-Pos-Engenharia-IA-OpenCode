import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";

import { ObservabilityService } from "./observability/observability.service";

export const CLIENT_ORIGIN = "http://localhost:5173";

export function configureApp(app: INestApplication): void {
  app.use(app.get(ObservabilityService).middleware);
  app.setGlobalPrefix("api/v1", {
    exclude: [{ path: "", method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: CLIENT_ORIGIN,
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}
