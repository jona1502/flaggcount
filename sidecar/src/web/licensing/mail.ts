import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import nodemailer from 'nodemailer';
import type { MailMessage, MailSender } from './billing';

/** Sends email through any SMTP provider, configured as `smtps://user:password@host:465`. */
export class SmtpMailSender implements MailSender {
  private readonly transport: nodemailer.Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
  }
}

/**
 * Local development only: appends messages to a JSON Lines file instead of sending them. The file
 * contains activation codes and must never be used in production.
 */
export class OutboxMailSender implements MailSender {
  constructor(private readonly path: string) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify({ sentAt: new Date().toISOString(), ...message })}\n`, { mode: 0o600 });
  }
}
