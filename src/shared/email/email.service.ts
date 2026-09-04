import { Resend } from 'resend';
import { envVariables } from '../../configs/env.config.js';
import { logger } from '../../configs/logger.config.js';

const resend = envVariables.RESEND_API_KEY ? new Resend(envVariables.RESEND_API_KEY) : undefined;

export async function sendAuthEmail(input: { to: string; subject: string; html: string; text: string }) {
  if (!resend || !envVariables.RESEND_FROM_EMAIL) {
    logger.warn('Authentication email skipped because Resend is not configured');
    return;
  }
  const html = `<main style="max-width:560px;margin:0 auto;padding:32px;font-family:Arial,sans-serif;background:#111;color:#fff"><p style="letter-spacing:2px;font-size:12px">ROGUEON / ACCOUNT</p><section style="padding:24px;background:#1b1b1b">${input.html}</section><p style="color:#aaa;font-size:12px">If you did not request this email, you can ignore it.</p></main>`;
  const result = await resend.emails.send({ from: envVariables.RESEND_FROM_EMAIL, to: input.to, subject: input.subject, html, text: input.text });
  if (result.error) logger.error('Authentication email delivery failed', { error: result.error.message });
}
