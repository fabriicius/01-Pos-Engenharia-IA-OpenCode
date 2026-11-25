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
import { ConfirmAccountUseCase } from "../src/auth/application/confirm-account.use-case";
import {
  InvalidConfirmationTokenError,
  SessionNotificationError,
} from "../src/auth/domain/errors";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";

const ENDPOINT = "/api/v1/auth/confirm-account";
const VALID_BODY = { token: "valid-token" };
const INVALID_LINK = "This confirmation link is invalid or has expired.";

describe("POST /api/v1/auth/confirm-account HTTP contract", () => {
  let app: INestApplication;
  let execute: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    execute = vi
      .spyOn(app.get(ConfirmAccountUseCase), "execute")
      .mockResolvedValue({
        accessToken: "jwt-value",
        tokenType: "Bearer",
        expiresIn: 86400,
      });
  });

  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({
      accessToken: "jwt-value",
      tokenType: "Bearer",
      expiresIn: 86400,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with only the 002 session response shape", async () => {
    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send(VALID_BODY)
      .expect(200);

    expect(response.body).toEqual({
      accessToken: "jwt-value",
      tokenType: "Bearer",
      expiresIn: 86400,
    });
    expect(execute).toHaveBeenCalledWith(VALID_BODY);
  });

  it("rejects a missing token with 400 and en-US validation errors", async () => {
    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({})
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining("token")]),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects an empty token and unknown fields with 400", async () => {
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ token: "" })
      .expect(400);
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ ...VALID_BODY, isAdmin: true })
      .expect(400);

    expect(execute).not.toHaveBeenCalled();
  });

  it("maps every invalid-link case to one generic 410", async () => {
    execute.mockRejectedValueOnce(new InvalidConfirmationTokenError());

    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ token: "used-token" })
      .expect(410);

    expect(response.body.message).toBe(INVALID_LINK);
    expect(JSON.stringify(response.body)).not.toContain("used-token");
  });

  it("maps a failed notification to a generic 502 without a token", async () => {
    execute.mockRejectedValueOnce(new SessionNotificationError());

    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send(VALID_BODY)
      .expect(502);

    expect(response.body.message).toBe(
      "Unable to confirm your account. Please try again.",
    );
    expect(response.body).not.toHaveProperty("accessToken");
  });

  it("does not consume a token on GET of the API endpoint", async () => {
    await request(app.getHttpServer()).get(ENDPOINT).expect(404);

    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps the unprefixed hello-world contract", async () => {
    await request(app.getHttpServer())
      .get("/")
      .expect(200, { message: "Hello World" });
  });
});
