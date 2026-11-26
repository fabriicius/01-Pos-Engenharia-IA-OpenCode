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
import { ResetPasswordUseCase } from "../src/auth/application/reset-password.use-case";
import {
  InvalidPasswordResetTokenError,
  PasswordResetNotificationError,
} from "../src/auth/domain/errors";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";

const ENDPOINT = "/api/v1/auth/reset-password";
const VALID_BODY = {
  token: "valid-token",
  password: "a-long-enough-password",
  confirmPassword: "a-long-enough-password",
};
const INVALID_LINK = "This password reset link is invalid or has expired.";

describe("POST /api/v1/auth/reset-password HTTP contract", () => {
  let app: INestApplication;
  let execute: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    execute = vi
      .spyOn(app.get(ResetPasswordUseCase), "execute")
      .mockResolvedValue(undefined);
  });

  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with a short acknowledgement and no token or password", async () => {
    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send(VALID_BODY)
      .expect(200);

    expect(response.body).toEqual({ message: "Your password has been reset." });
    expect(JSON.stringify(response.body)).not.toContain("valid-token");
    expect(JSON.stringify(response.body)).not.toContain(VALID_BODY.password);
    expect(execute).toHaveBeenCalledWith(VALID_BODY);
  });

  it("rejects missing fields, short passwords, mismatches and unknown fields with 400", async () => {
    await request(app.getHttpServer()).post(ENDPOINT).send({}).expect(400);
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ ...VALID_BODY, token: "" })
      .expect(400);
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ ...VALID_BODY, password: "short", confirmPassword: "short" })
      .expect(400);
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ ...VALID_BODY, confirmPassword: "different-password" })
      .expect(400);
    await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ ...VALID_BODY, isAdmin: true })
      .expect(400);

    expect(execute).not.toHaveBeenCalled();
  });

  it("maps expired, used and unknown tokens to the same generic 410", async () => {
    for (const token of ["expired-token", "used-token", "unknown-token"]) {
      execute.mockRejectedValueOnce(new InvalidPasswordResetTokenError());

      const response = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ ...VALID_BODY, token })
        .expect(410);

      expect(response.body.message).toBe(INVALID_LINK);
      expect(JSON.stringify(response.body)).not.toContain(token);
    }
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("maps a failed notification to a generic 502 without a success message", async () => {
    execute.mockRejectedValueOnce(new PasswordResetNotificationError());

    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send(VALID_BODY)
      .expect(502);

    expect(response.body.message).toBe(
      "Unable to reset your password. Please try again.",
    );
    expect(response.body.message).not.toBe("Your password has been reset.");
  });

  it("returns a generic 500 for an operator-only database failure", async () => {
    execute.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send(VALID_BODY)
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      message: "Internal server error",
    });
    expect(JSON.stringify(response.body)).not.toContain("valid-token");
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
