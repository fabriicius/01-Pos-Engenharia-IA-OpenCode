import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";
import { ObservabilityService } from "../src/observability/observability.service";

describe("HTTP operational telemetry", () => {
  let app: import("@nestjs/common").INestApplication;
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    app.use(
      "/telemetry-fault",
      (_req: unknown, _res: unknown, next: (error: Error) => void) =>
        next(new Error("private-exception-sentinel")),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("counts completion, validation and guard failures once without storing request input", async () => {
    await request(app.getHttpServer()).get("/").expect(200);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me?token=secret-sentinel")
      .set("Authorization", "Bearer secret-sentinel")
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({ email: "secret-sentinel", password: "secret-sentinel" })
      .expect(400);
    await request(app.getHttpServer())
      .get("/private-secret-sentinel")
      .expect(404);
    await request(app.getHttpServer()).get("/telemetry-fault").expect(500);
    await request(app.getHttpServer())
      .trace("/unknown-method-private")
      .expect(404);
    const metrics = await app.get(ObservabilityService).registry.metrics();
    expect(metrics).toMatch(
      /api_http_requests_total\{method="GET",route="\/",status="200"[^}]*\} 1/,
    );
    expect(metrics).toMatch(
      /api_http_requests_total\{method="GET",route="\/api\/v1\/auth\/me",status="401"[^}]*\} 1/,
    );
    expect(metrics).toMatch(
      /api_http_requests_total\{method="POST",route="\/api\/v1\/auth\/sign-in",status="400"[^}]*\} 1/,
    );
    expect(metrics).toMatch(
      /api_http_requests_total\{method="GET",route="unmatched",status="404"[^}]*\} 1/,
    );
    expect(metrics).toMatch(
      /api_http_requests_total\{method="GET",route="unmatched",status="500"[^}]*\} 1/,
    );
    expect(metrics).toMatch(
      /api_http_requests_total\{method="OTHER",route="unmatched",status="404"[^}]*\} 1/,
    );
    expect(metrics).not.toContain("private-");
    expect(metrics).not.toContain("secret-sentinel");
    expect(metrics).toContain("api_http_in_flight");
  });
});
