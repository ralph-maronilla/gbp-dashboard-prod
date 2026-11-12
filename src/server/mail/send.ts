import "server-only";
import { appendFile } from "node:fs/promises";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | undefined;

function getTransport(): Transporter | undefined {
  const smtp = env.smtp;
  if (!smtp.host) return undefined;
  transport ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure && env.isProd, // never send credentials or links in clear text in production
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Sends through SMTP. In development with no SMTP_HOST the email is printed to the server log instead (links included). */
export async function sendMail(mail: Mail): Promise<void> {
  const t = getTransport();
  if (!t) {
    if (env.isProd) throw new Error("SMTP_HOST is not set: cannot send email in production");
    // Browser tests read the emails (and their links) from this file. Development only, never in production.
    if (process.env.MAIL_OUTBOX_FILE) await appendFile(process.env.MAIL_OUTBOX_FILE, JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.text }) + "\n");
    console.info(`\n[mail:dev] To: ${mail.to}\n[mail:dev] Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  await t.sendMail({ from: env.smtp.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
}
