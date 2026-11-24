import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";

const HELLO_WORLD = { message: "Hello World" };

describe("AppController HTTP contract", () => {
  let app: import("@nestjs/common").INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET / returns the hello-world JSON contract", async () => {
    const response = await request(app.getHttpServer()).get("/").expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(HELLO_WORLD);
  });

  it("GET /api/v1/does-not-exist returns JSON 404 and the app stays up", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/does-not-exist")
      .expect(404)
      .expect("Content-Type", /application\/json/);

    await request(app.getHttpServer()).get("/").expect(200, HELLO_WORLD);
  });
});
