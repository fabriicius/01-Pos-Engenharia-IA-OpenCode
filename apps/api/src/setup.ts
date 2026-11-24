import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";

export const CLIENT_ORIGIN = "http://localhost:5173";

export function configureApp(app: INestApplication): void {
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
  app.enableCors({ origin: CLIENT_ORIGIN });
}
