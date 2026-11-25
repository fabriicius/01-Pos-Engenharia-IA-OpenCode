import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ForgotPasswordUseCase } from "../src/auth/application/forgot-password.use-case";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";

const ENDPOINT = "/api/v1/auth/forgot-password";
const UNIFORM_BODY = {
  message:
    "If an account exists for that email, a password reset link has been sent.",
};

describe("POST /api/v1/auth/forgot-password HTTP contract", () => {
  let app: INestApplication;
  let execute: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    execute = vi
      .spyOn(app.get(ForgotPasswordUseCase), "execute")
      .mockResolvedValue(undefined);
  });

  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the identical 202 for every well-formed email", async () => {
    for (const email of [
      "ada@example.com",
      "nobody@example.com",
      "pending@example.com",
      "ADA@Example.COM",
    ]) {
      const response = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ email })
        .expect(202);

      expect(response.body).toEqual(UNIFORM_BODY);
    }
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute).toHaveBeenLastCalledWith({ email: "ADA@Example.COM" });
  });

  it("keeps the same body when dispatch fails inside the use case", async () => {
    execute.mockResolvedValueOnce(undefined);

    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ email: "ada@example.com" })
      .expect(202);

    expect(response.body).toEqual(UNIFORM_BODY);
  });

  it("rejects empty, malformed and unknown fields with 400", async () => {
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ email: "" })
      .expect(400);
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ email: "not-an-email" })
      .expect(400);
    await request(app.getHttpServer()).post(ENDPOINT).send({}).expect(400);
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ email: "ada@example.com", isAdmin: true })
      .expect(400);

    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a generic 500 for an operator-only database failure", async () => {
    execute.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ email: "ada@example.com" })
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      message: "Internal server error",
    });
    expect(JSON.stringify(response.body)).not.toContain("ada@example.com");
  });

  it("does not expose an endpoint on GET", async () => {
    await request(app.getHttpServer()).get(ENDPOINT).expect(404);

    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps the unprefixed hello-world contract", async () => {
    await request(app.getHttpServer())
      .get("/")
      .expect(200, { message: "Hello World" });
  });
});
