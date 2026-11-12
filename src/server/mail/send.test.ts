import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn(async () => ({}));
const createTransport = vi.fn((..._args: unknown[]) => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const mail = { to: "a@b.co", subject: "Hi", text: "text", html: "<p>html</p>" };

// The transport is created once per process, so each test loads a fresh copy of the module with its own environment.
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "MAIL_OUTBOX_FILE"]) vi.stubEnv(k, "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("./send")).sendMail;
}

beforeEach(() => {
  sendMail.mockClear();
  createTransport.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendMail", () => {
  it("in production sends through SMTP, requires TLS on a STARTTLS port, and authenticates", async () => {
    const send = await load({ NODE_ENV: "production", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "App <no-reply@example.com>" });
    await send(mail);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false, requireTLS: true, auth: { user: "u", pass: "p" } }));
    expect(sendMail).toHaveBeenCalledWith({ from: "App <no-reply@example.com>", to: "a@b.co", subject: "Hi", text: "text", html: "<p>html</p>" });
  });

  it("port 465 means implicit TLS", async () => {
    const send = await load({ NODE_ENV: "production", SMTP_HOST: "smtp.example.com", SMTP_PORT: "465" });
    await send(mail);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }));
  });

  it("sends without a login when none is configured", async () => {
    const send = await load({ NODE_ENV: "production", SMTP_HOST: "relay.internal" });
    await send(mail);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it("in production with no SMTP host it refuses instead of dropping the email silently", async () => {
    const send = await load({ NODE_ENV: "production" });
    await expect(send(mail)).rejects.toThrow(/SMTP_HOST/);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("in development with no SMTP host it prints the email (link included) and sends nothing", async () => {
    const send = await load({ NODE_ENV: "development" });
    await send({ ...mail, text: "Open https://x.test/verify?token=abc" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(vi.mocked(console.info).mock.calls.flat().join(" ")).toContain("https://x.test/verify?token=abc");
  });

  it("never writes the outbox file in production, even if the variable is set", async () => {
    const send = await load({ NODE_ENV: "production", MAIL_OUTBOX_FILE: "/tmp/should-not-exist.jsonl" });
    await expect(send(mail)).rejects.toThrow(/SMTP_HOST/);
  });
});
