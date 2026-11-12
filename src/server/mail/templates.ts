import type { Mail } from "./send";

const APP = "GBP Review Dashboard";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function layout(heading: string, intro: string, button: string, url: string, outro: string): { text: string; html: string } {
  const text = `${heading}\n\n${intro}\n\n${button}: ${url}\n\n${outro}\n\n${APP}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2024">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px"><tr><td>
<h1 style="font-size:20px;margin:0 0 16px">${esc(heading)}</h1>
<p style="margin:0 0 24px;line-height:1.5">${esc(intro)}</p>
<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5b6168;line-height:1.5">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;color:#5b6168;line-height:1.5">${esc(outro)}</p>
</td></tr></table></body></html>`;
  return { text, html };
}

export function verificationEmail(to: string, name: string, url: string): Mail {
  const hi = name ? `Hi ${name},` : "Hi,";
  const body = layout(
    "Confirm your email address",
    `${hi} confirm your email to finish creating your ${APP} account. An administrator will then review and approve your access.`,
    "Confirm email",
    url,
    "This link expires in 24 hours. If you did not create an account, you can ignore this email.",
  );
  return { to, subject: `Confirm your email for ${APP}`, ...body };
}

export function resetPasswordEmail(to: string, name: string, url: string): Mail {
  const hi = name ? `Hi ${name},` : "Hi,";
  const body = layout(
    "Reset your password",
    `${hi} we received a request to set a new password for your ${APP} account.`,
    "Choose a new password",
    url,
    "This link expires in 1 hour and works once. If you did not ask for this, you can ignore this email; your password stays the same.",
  );
  return { to, subject: `Reset your ${APP} password`, ...body };
}
